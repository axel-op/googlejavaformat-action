import { expect, jest, test } from '@jest/globals';
import { ExecOptions } from '@actions/exec';
import { wrapExecutor } from '../src/exec';

function mockWrappedExec(returnCode: number, std: { stdOut: string, stdErr: string }) {
    return jest.fn((command: string, args?: string[], options?: ExecOptions) => {
        options?.listeners?.stdout?.(Buffer.from(std.stdOut));
        options?.listeners?.stderr?.(Buffer.from(std.stdErr));
        return Promise.resolve(returnCode);
    });
}

test('test executing command with no error', async () => {
    const stdOut = 'hello world';
    const stdErr = '';
    const exitCode = 0;
    const mockedWrapped = mockWrappedExec(exitCode, { stdOut, stdErr });
    const execute = wrapExecutor(mockedWrapped);
    const command = 'echo';
    const args = ['hello world'];
    const result = await execute(command, args);
    expect(result).toEqual({ exitCode, stdOut, stdErr });
    expect(mockedWrapped).toHaveBeenCalledTimes(1);
});

test('test executing command with error and ignoring return code', async () => {
    const stdOut = 'hello world';
    const stdErr = '';
    const exitCode = 1;
    const mockedWrapped = mockWrappedExec(exitCode, { stdOut, stdErr });
    const execute = wrapExecutor(mockedWrapped);
    const command = 'echo';
    const args = ['hello world'];
    const result = await execute(command, args);
    expect(result).toEqual({ exitCode, stdOut, stdErr });
    expect(mockedWrapped).toHaveBeenCalledTimes(1);
});

test('test executing command with error and not ignoring return code', async () => {
    const stdOut = 'hello world';
    const stdErr = '';
    const exitCode = 1;
    const mockedWrapped = mockWrappedExec(exitCode, { stdOut, stdErr });
    const execute = wrapExecutor(mockedWrapped);
    const command = 'echo';
    const args = ['hello world'];
    const fn = async () => await execute(command, args, { ignoreReturnCode: false });
    await expect(fn).rejects.toThrow(new Error("Command 'echo hello world' failed with exit code 1"));
    expect(mockedWrapped).toHaveBeenCalledTimes(1);
});