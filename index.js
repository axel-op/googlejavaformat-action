const core = require('@actions/core');
const exec = require('@actions/exec');
const glob = require('@actions/glob');
const github = require('@actions/github');
const path = require('path');

function getInput(inputAlternativeNames, { required = false } = {}) {
    if (!(inputAlternativeNames && inputAlternativeNames.length)) throw new Error("inputAlternativeNames is empty");
    let val = "";
    for (const [i, inputName] of inputAlternativeNames.entries()) {
        val = core.getInput(inputName, {
            required: required && i === inputAlternativeNames.length - 1
        });
        core.debug(`${val ? "Value" : "No value"} provided for input "${inputName}"`);
        if (val) break;
    }
    return val;
}

const owner = 'google';
const repo = 'google-java-format';
const githubToken = getInput(['githubToken', 'github-token'], { required: false });
const commitMessage = getInput(['commitMessage', 'commit-message'], { required: false });
const executable = path.join(process.env.HOME || process.env.USERPROFILE, 'google-java-format.jar');
const apiReleases = `https://api.github.com/repos/${owner}/${repo}/releases`;

class ExecResult {
    constructor(exitCode, stdOut, stdErr) {
        this.exitCode = exitCode;
        this.stdOut = stdOut;
        this.stdErr = stdErr;
    }
}

async function executeGJF(args = []) {
    const arguments = [];
    const javaVersion = await getJavaVersion();
    // see https://github.com/google/google-java-format#jdk-16
    if (javaVersion !== undefined && javaVersion >= 11)
        arguments.push(...['api', 'file', 'parser', 'tree', 'util']
            .flatMap(l => ['--add-exports', `jdk.compiler/com.sun.tools.javac.${l}=ALL-UNNAMED`]));
    arguments.push('-jar', executable);
    arguments.push(...args);
    const options = {
        cwd: process.env.GITHUB_WORKSPACE,
        ignoreReturnCode: true
    }
    const exitCode = await exec.exec('java', arguments, options);
    if (exitCode !== 0) {
        throw `Google Java Format failed with exit code ${exitCode}`;
    }
}

async function execute(command, { silent = false, ignoreReturnCode = false } = {}) {
    let stdErr = '';
    let stdOut = '';
    const options = {
        silent: silent,
        ignoreReturnCode: true,
        listeners: {
            stdout: (data) => stdOut += data.toString(),
            stderr: (data) => stdErr += data.toString(),
        }
    };
    core.debug(`Executing: ${command}`);
    const exitCode = await exec.exec(command, null, options);
    core.debug(`Exit code: ${exitCode}`);
    if (!ignoreReturnCode && exitCode !== 0) {
        command = command.split(' ')[0];
        throw `The command '${command}' failed with exit code ${exitCode}`;
    }
    return new ExecResult(exitCode, stdOut, stdErr);
}

async function curl(url, arguments) {
    let command = `curl -sL "${url}"`;
    if (arguments) command += ` ${arguments}`;
    return await execute(command, { silent: !core.isDebug() });
}

async function listGJFReleases() {
    if (!githubToken) {
        const releases = await curl(apiReleases);
        return JSON.parse(releases.stdOut);
    }
    const octokit = github.getOctokit(githubToken);
    const releases = await octokit.rest.repos.listReleases({
        owner: owner,
        repo: repo
    });
    return releases.data;
}

async function getRelease(releaseId) {
    if (!githubToken) {
        const url = `${apiReleases}/${releaseId}`;
        core.debug(`URL: ${url}`);
        const release = await curl(url);
        return JSON.parse(release.stdOut);
    }
    const octokit = github.getOctokit(githubToken);
    const release = await octokit.rest.repos.getRelease({
        owner: owner,
        repo: repo,
        release_id: releaseId
    });
    return release.data;
}

async function getJavaVersion() {
    let javaVersion = await execute('java -version', { silent: !core.isDebug() });
    javaVersion = javaVersion.stdErr
        .split('\n')[0]
        .match(RegExp(/[0-9\.]+/))[0];
    core.debug(`Extracted version number: ${javaVersion}`);
    if (javaVersion.startsWith('1.')) javaVersion = javaVersion.replace(RegExp(/^1\./), '');
    javaVersion = javaVersion.split('\.')[0];
    return parseInt(javaVersion);
}

async function getReleaseId() {
    let releaseId = 'latest';
    const releases = await listGJFReleases();
    core.debug(`releases is ${typeof releases}`);
    const findRelease = function (name) { return releases.find(r => r['name'] === name); };
    // Check if a specific version is requested
    const input = core.getInput('version');
    if (input) {
        const release = findRelease(input);
        if (release) return release['id'];
        core.warning(`Version "${input}" of Google Java Format cannot be found. Fallback to latest.`);
    }
    const javaVersion = await getJavaVersion();
    if (isNaN(javaVersion)) core.warning('Cannot determine JDK version');
    else {
        core.info(`Version of JDK: ${javaVersion}`);
        if (javaVersion < 11) {
            // Versions after 1.7 require Java SDK 11+
            core.warning('Latest versions of Google Java Format require Java SDK 11 min. Fallback to Google Java Format 1.7.');
            releaseId = findRelease('1.7')['id'];
            if (!releaseId) throw 'Cannot find release id of Google Java Format 1.7';
        }
    }
    return releaseId;
}

async function push() {
    if (!githubToken) await execute('git push');
    else {
        const env = process.env;
        const remote = `https://${env.GITHUB_ACTOR}:${githubToken}@github.com/${env.GITHUB_REPOSITORY}.git`;
        await execute(`git push ${remote}`);
    }
}

async function run() {
    try {
        // Get Google Java Format executable and save it to [executable]
        const releaseId = await getReleaseId();
        await core.group('Downloading Google Java Format', async () => {
            let release = await getRelease(releaseId)
            core.debug(`release is ${typeof release}`);
            const assets = release['assets'];
            core.debug(`assets is ${typeof assets}`);
            const downloadUrl = assets.find(asset => asset['name'].endsWith('all-deps.jar'))['browser_download_url'];
            core.info(`Downloading executable to ${executable}`);
            await curl(downloadUrl, `-o ${executable}`)
            await executeGJF(['--version']);
        });

        // Execute Google Java Format with provided arguments
        const args = core.getInput('args').split(' ');
        core.debug(`Arguments: ${args}`);
        const exclude = core.getInput('files-excluded');
        const excludeRex = exclude && new RegExp(exclude);
        const files = await (await glob.create(core.getInput('files'))).glob();
        core.debug(`Files:`);
        for (const file of files) {
            if (!excludeRex || !excludeRex.test(file)) {
                core.debug(`* ${file}`);
                args.push(file);
            }
        }
        await executeGJF(args);

        // Commit changed files if there are any and if skipCommit != true
        if (getInput(['skipCommit', 'skip-commit']).toLowerCase() !== 'true') {
            await core.group('Committing changes', async () => {
                await execute('git config user.name github-actions', { silent: true });
                await execute("git config user.email ''", { silent: true });
                const diffIndex = await execute('git diff-index --quiet HEAD', { ignoreReturnCode: true, silent: true });
                if (diffIndex.exitCode !== 0) {
                    await execute(`git commit --all -m "${commitMessage ? commitMessage : 'Google Java Format'}"`);
                    await push();
                } else core.info('Nothing to commit!')
            });
        }
    } catch (message) {
        core.setFailed(message);
    }
}

run()
