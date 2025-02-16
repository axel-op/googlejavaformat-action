import { CommandExecutor, CommandExecutorOptions } from "./exec";

export class GitOperations {
    private readonly execute: CommandExecutor;

    constructor(executor: CommandExecutor) {
        this.execute = executor;
    }

    async configureGit() {
        const options: CommandExecutorOptions = { silent: true };
        await this.execute('git', ['config', 'user.name', 'github-actions'], options);
        await this.execute('git', ['config', 'user.email', ''], options);
    }

    async hasChanges(): Promise<boolean> {
        const commandResult = await this.execute('git', ['diff-index', '--quiet', 'HEAD'], {
            ignoreReturnCode: true,
            silent: true,
        });
        return commandResult.exitCode !== 0;
    }

    async commitAll(commitMessage: string) {
        await this.execute('git', ['commit', '--all', '-m', commitMessage]);
    }

    async push(options: { repository: string, githubActor: string, githubToken?: string }) {
        if (!options.githubToken) {
            await this.execute('git', ['push']);
        } else {
            const remote = `https://${options.githubActor}:${options.githubToken}@github.com/${options.repository}.git`; 
            await this.execute('git', ['push', remote]);
        }
    }
}