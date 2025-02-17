import * as core from '@actions/core';
import * as github from '@actions/github';
import * as glob from '@actions/glob';
import * as path from 'path';
import { CommandExecutor, CommandExecutorOptions, CommandExecutorResult } from './exec';
import { GitOperations } from './git';
import { ReleaseData, Releases } from './releases';

export function getInput(inputAlternativeNames: string[]) {
    if (inputAlternativeNames.length === 0) throw new Error("inputAlternativeNames is empty");
    let val: string | undefined;
    for (const inputName of inputAlternativeNames) {
        val = core.getInput(inputName) || undefined;
        core.debug(`${val ? "Value" : "No value"} provided for input "${inputName}"`);
        if (val) break;
    }
    return val;
}

export class Main {
    readonly execute: CommandExecutor;
    readonly releases: Releases;
    readonly gitOperations: GitOperations;
    readonly githubToken: string | undefined;
    readonly executablePath: string;

    constructor(executor: CommandExecutor, executablePath: string = path.join((process.env.HOME || process.env.USERPROFILE)!, 'google-java-format.jar')) {
        this.execute = executor;
        this.gitOperations = new GitOperations(executor);
        this.githubToken = getInput(['githubToken', 'github-token']);
        const octokit = this.githubToken ? github.getOctokit(this.githubToken) : undefined;
        this.releases = new Releases(executor, octokit);
        this.executablePath = executablePath;
    }

    async getJavaVersion(): Promise<number> {
        const javaVersion = await this.execute('java', ['-version'], { silent: true, ignoreReturnCode: false });
        core.debug(javaVersion.stdErr);
        let versionNumber = javaVersion.stdErr
            .split('\n')[0]
            .match(RegExp(/[0-9\.]+/))
            ?.[0];
        if (!versionNumber) throw new Error("Cannot find Java version number");
        core.debug(`Extracted version number: ${versionNumber}`);
        if (versionNumber.startsWith('1.')) versionNumber = versionNumber.replace(RegExp(/^1\./), '');
        versionNumber = versionNumber.split('\.')[0];
        return parseInt(versionNumber);
    }

    async executeGJF(javaVersion: number, userArgs: string[] = []): Promise<CommandExecutorResult> {
        const args = new Array<string>();
        // see https://github.com/google/google-java-format#jdk-16
        if (javaVersion >= 11) {
            const modules = ['api', 'file', 'parser', 'tree', 'util'];
            const exports = modules.flatMap(l => ['--add-exports', `jdk.compiler/com.sun.tools.javac.${l}=ALL-UNNAMED`]);
            args.push(...exports);
        }
        args.push('-jar', this.executablePath, ...userArgs);
        const options: CommandExecutorOptions = { ignoreReturnCode: false };
        return await this.execute('java', args, options);
    }

    async getReleaseData(javaVersion: number, releaseName: string | undefined): Promise<ReleaseData> {
        if (!releaseName) {
            return this.releases.getLatestReleaseData(javaVersion);
        }
        const releaseData = await this.releases.getReleaseDataByName(releaseName);
        if (!releaseData) {
            throw new Error(`Cannot find release id of Google Java Format ${releaseName}`);
        }
        return releaseData;
    }

    getDownloadUrl(releaseData: ReleaseData) {
        const downloadUrl = releaseData.assets.find(asset => asset.name.endsWith('all-deps.jar'))?.browser_download_url;
        if (!downloadUrl) {
            throw new Error("Cannot find URL to Google Java Format executable");
        }
        return downloadUrl;
    }

    async getGJFArgs(inputs: { args: string[], filesExcluded: string | undefined, files: string }): Promise<string[]> {
        const args = new Array(...inputs.args);
        const includePattern = inputs.files;
        const excludePattern = inputs.filesExcluded;
        const includeFiles = await (await glob.create(includePattern)).glob();
        const excludeFiles = new Set(excludePattern ? await (await glob.create(excludePattern)).glob() : []);
        return args.concat(includeFiles.filter(f => !excludeFiles.has(f)));
    }

    async downloadExecutable(downloadUrl: string) {
        core.info(`Downloading executable to ${this.executablePath}`);
        await this.execute('curl', ['-sL', downloadUrl, '-o', this.executablePath], { ignoreReturnCode: false });
    }

    async commitChanges(inputs: { commitMessage: string | undefined, githubActor: string, repository: string }) {
        await this.gitOperations.configureGit();
        const hasChanges = await this.gitOperations.hasChanges();
        if (hasChanges) {
            await this.gitOperations.commitAll(inputs.commitMessage || 'Google Java Format');
            await this.gitOperations.push({
                ...inputs,
                githubToken: this.githubToken,
            });
        } else {
            core.info('Nothing to commit!');
        }
    }

    async run(): Promise<void> {
        try {
            const javaVersion = await this.getJavaVersion();
            // Get Google Java Format executable and save it to [executable]
            await core.group('Download Google Java Format', async () => {
                const releaseName = getInput(['release-name', 'version']);
                const release = await this.getReleaseData(javaVersion, releaseName);
                const downloadUrl = this.getDownloadUrl(release);
                await this.downloadExecutable(downloadUrl);
                await this.executeGJF(javaVersion, ['--version']);
            });
    
            // Execute Google Java Format with provided arguments
            const args = await this.getGJFArgs({
                args: core.getInput('args').split(' '),
                files: core.getInput('files', { required: true }),
                filesExcluded: core.getInput('files-excluded'),
            });
            await this.executeGJF(javaVersion, args);
    
            // Commit changed files if there are any and if skipCommit != true
            const skipCommit = getInput(['skipCommit', 'skip-commit'])?.toLowerCase() === 'true';
            if (!skipCommit) {
                await core.group('Commit changes', async () => {
                    await this.commitChanges({
                        commitMessage: getInput(['commitMessage', 'commit-message']),
                        githubActor: process.env.GITHUB_ACTOR!,
                        repository: process.env.GITHUB_REPOSITORY!,
                    });
                });
            }
        } catch (message) {
            core.setFailed(message);
        }
    }
}