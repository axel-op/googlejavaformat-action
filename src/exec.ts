import * as core from '@actions/core';
import * as exec from '@actions/exec';

export interface CommandExecutorResult {
    exitCode: number;
    stdOut: string;
    stdErr: string;
}

export interface CommandExecutorOptions {
    silent?: boolean;
    ignoreReturnCode?: boolean;
    workingDirectory?: string;
}

export type CommandExecutor = (command: string, args?: string[], options?: CommandExecutorOptions) => Promise<CommandExecutorResult>;

export function wrapExecutor(wrapped: typeof exec.exec): CommandExecutor {
    return async function execute(command: string, args?: string[], options?: CommandExecutorOptions) {
        let stdErr = '';
        let stdOut = '';
        const opts: exec.ExecOptions = {
            cwd: options?.workingDirectory,
            silent: options?.silent ?? true,
            ignoreReturnCode: true,
            listeners: {
                stdout: (data) => stdOut += data.toString(),
                stderr: (data) => stdErr += data.toString(),
            }
        };
        const commandStr = `${command} ${args?.join(' ')}`.trim();
        core.debug(`Executing: ${commandStr}`);
        const exitCode = await wrapped(command, args, opts);
        core.debug(`Command '${commandStr}' terminated with exit code ${exitCode}`);
        const result = { exitCode, stdOut, stdErr };
        core.debug(JSON.stringify(result));
        if (!(options?.ignoreReturnCode ?? true) && exitCode !== 0) {
            throw new Error(`Command '${commandStr}' failed with exit code ${exitCode}`);
        }
        return result;
    }
}
