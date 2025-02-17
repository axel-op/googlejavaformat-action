import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { getInput, Main } from '../src/main';
import { CommandExecutor } from '../src/exec';
import { ReleaseData, Releases } from '../src/releases';
import { GitOperations } from '../src/git';

const mockGetLatestReleaseData = jest.fn<InstanceType<typeof Releases>['getLatestReleaseData']>();
const mockGetReleaseDataByName = jest.fn<InstanceType<typeof Releases>['getReleaseDataByName']>();
jest.mock('../src/releases', () => {
    return {
        Releases: jest.fn().mockImplementation(() => {
            return {
                getLatestReleaseData: mockGetLatestReleaseData,
                getReleaseDataByName: mockGetReleaseDataByName,
            }
        }),
    };
});

const mockHasChanges = jest.fn<InstanceType<typeof GitOperations>['hasChanges']>();
const mockCommitAll = jest.fn<InstanceType<typeof GitOperations>['commitAll']>();
const mockPush = jest.fn<InstanceType<typeof GitOperations>['push']>();
jest.mock('../src/git', () => {
    return {
        GitOperations: jest.fn().mockImplementation(() => {
            return {
                configureGit: () => { },
                commitAll: mockCommitAll,
                hasChanges: mockHasChanges,
                push: mockPush,
            }
        }),
    };
});

const executor = jest.fn<CommandExecutor>();

beforeEach(() => {
    executor.mockReset();
});

const dummyReleaseData: ReleaseData = {
    url: "",
    html_url: "",
    assets_url: "",
    upload_url: "",
    tarball_url: null,
    zipball_url: null,
    id: 0,
    node_id: "",
    tag_name: "",
    target_commitish: "",
    name: "dummy-release-data",
    draft: false,
    prerelease: false,
    created_at: "",
    published_at: null,
    author: {
        name: undefined,
        email: undefined,
        login: "",
        id: 0,
        node_id: "",
        avatar_url: "",
        gravatar_id: null,
        url: "",
        html_url: "",
        followers_url: "",
        following_url: "",
        gists_url: "",
        starred_url: "",
        subscriptions_url: "",
        organizations_url: "",
        repos_url: "",
        events_url: "",
        received_events_url: "",
        type: "",
        site_admin: false,
        starred_at: undefined
    },
    assets: []
};

function defineInput(inputName: string, inputValue?: string) {
    process.env[`INPUT_${inputName.toUpperCase()}`] = inputValue;
}

describe('test getting inputs', () => {
    const existingInputName = "my-input";
    const existingInputValue = "my-input-value";

    beforeEach(() => {
        defineInput(existingInputName, existingInputValue);
    });

    afterEach(() => {
        defineInput(existingInputName, undefined);
    });

    test('test getting existing input value', () => {
        const value = getInput([existingInputName, "non-existing-input"]);
        expect(value).toBe(existingInputValue);
    });

    test('test getting existing input value with fallback input name', () => {
        const value = getInput(["input_name_one", existingInputName]);
        expect(value).toBe(existingInputValue);
    });

    test('test getting non existing input value', () => {
        const inputName = "my-non-existing-input";
        const value = getInput([inputName]);
        expect(value).toBeUndefined();
    });
});

describe('test getting Java version', () => {
    const main = new Main(executor);

    test('test invalid return code', () => {
        const error = new Error("Command 'java -version' failed with exit code 1");
        executor.mockReturnValueOnce(Promise.reject(error));
        expect(() => main.getJavaVersion())
            .rejects
            .toThrow(error);
        expect(executor).lastCalledWith('java', ['-version'], { ignoreReturnCode: false, silent: true });
    });

    test('test no output', () => {
        executor.mockReturnValueOnce(Promise.resolve({
            exitCode: 0,
            stdErr: '',
            stdOut: '',
        }));
        expect(() => main.getJavaVersion())
            .rejects
            .toThrow(new Error("Cannot find Java version number"));
        expect(executor).lastCalledWith('java', ['-version'], { ignoreReturnCode: false, silent: true });
    });

    test('test version <= JDK 8', () => {
        executor.mockReturnValueOnce(Promise.resolve({
            exitCode: 0,
            stdErr: 'java version "1.8.0_211"',
            stdOut: '',
        }));
        expect(main.getJavaVersion())
            .resolves
            .toBe(8);
        expect(executor).lastCalledWith('java', ['-version'], { ignoreReturnCode: false, silent: true });
    });

    test('test version > JDK 8', () => {
        executor.mockReturnValueOnce(Promise.resolve({
            exitCode: 0,
            stdErr: 'openjdk version "21.0.6" 2025-01-21',
            stdOut: '',
        }));
        expect(main.getJavaVersion())
            .resolves
            .toBe(21);
        expect(executor).lastCalledWith('java', ['-version'], { ignoreReturnCode: false, silent: true });
    });
});

describe('test getting release data', () => {
    test('if no release name, then return latest release', async () => {
        const main = new Main(executor);
        mockGetLatestReleaseData.mockReturnValueOnce(Promise.resolve(dummyReleaseData));
        const releaseData = await main.getReleaseData(21, undefined);
        expect(releaseData).toEqual(dummyReleaseData);
    });

    test('if release name, then return it', async () => {
        const releaseName = 'my-release';
        const main = new Main(executor);
        mockGetReleaseDataByName.mockReturnValueOnce(Promise.resolve(dummyReleaseData));
        const releaseData = await main.getReleaseData(11, releaseName);
        expect(releaseData).toEqual(dummyReleaseData);
        expect(mockGetReleaseDataByName).lastCalledWith(releaseName);
    });

    test('if release not found, then throw', async () => {
        const releaseName = 'my-release';
        defineInput('version', releaseName);
        const main = new Main(executor);
        mockGetReleaseDataByName.mockReturnValueOnce(Promise.resolve(undefined));
        expect(() => main.getReleaseData(11, releaseName))
            .rejects
            .toThrow(new Error(`Cannot find release id of Google Java Format ${releaseName}`));
        expect(mockGetReleaseDataByName).lastCalledWith(releaseName);
    });
});

describe('test getting args', () => {
    const main = new Main(executor);

    test('if input has args, then output has them too', async () => {
        const inputs = { args: ['--replace'], files: '**/*.java', filesExcluded: undefined };
        const output = await main.getGJFArgs(inputs);
        expect(output).toEqual(['--replace']);
    });

    test('files matching glob are appended to output', async () => {
        const inputs = { args: ['--replace'], files: '*.md', filesExcluded: undefined };
        const output = await main.getGJFArgs(inputs);
        expect(output).toHaveLength(2);
        expect(output[0]).toEqual('--replace');
        expect(output[1]).toMatch(/^.*README\.md$/);
    });

    test('if input has exclusion glob, then output excludes matching files', async () => {
        const inputs = { args: ['--replace'], files: '*.md', filesExcluded: '*.md' };
        const output = await main.getGJFArgs(inputs);
        expect(output).toEqual(['--replace']);
    })
});

describe('commit changes', () => {
    const githubToken = '***';
    defineInput('github-token', githubToken);
    const main = new Main(executor);

    test('if there is no change, then skip commit', async () => {
        mockHasChanges.mockReturnValueOnce(Promise.resolve(false));
        await main.commitChanges({ githubActor: '', repository: '', commitMessage: undefined, });
        expect(mockCommitAll).not.toBeCalled();
        expect(mockPush).not.toBeCalled();
    });

    test('if there are changes, but no commit message, then commit with default message', async () => {
        mockHasChanges.mockReturnValueOnce(Promise.resolve(true));
        const githubActor = "actor";
        const repository = "actor/repo";
        await main.commitChanges({ githubActor, repository, commitMessage: undefined });
        expect(mockCommitAll).toHaveBeenCalledWith('Google Java Format');
        expect(mockPush).toBeCalledWith({ githubActor, repository, githubToken });
    });

    test('if there are changes, and a commit message, then commit with message', async () => {
        mockHasChanges.mockReturnValueOnce(Promise.resolve(true));
        const githubActor = "actor";
        const repository = "actor/repo";
        const commitMessage = "my message";
        await main.commitChanges({ githubActor, repository, commitMessage });
        expect(mockCommitAll).toHaveBeenCalledWith(commitMessage);
        expect(mockPush).toBeCalledWith({ githubActor, repository, githubToken });
    });
});

describe('execute Google Java Format', () => {
    const executablePath = 'google-java-format.jar';
    const main = new Main(executor, executablePath);
    
    test('when running GJF, then pass user args to command', async () => {
        const mockedResult = { exitCode: 0, stdErr: '', stdOut: '' };
        executor.mockReturnValueOnce(Promise.resolve(mockedResult));
        const args = ['a', 'b', 'c'];
        const result = await main.executeGJF(8, args);
        expect(result).toEqual(mockedResult);
        expect(executor).lastCalledWith('java', ['-jar', executablePath, 'a', 'b', 'c'], { ignoreReturnCode: false });
    });

    test('when running GJF with java version >= 11, then exports required jdk modules', async () => {
        const mockedResult = { exitCode: 0, stdErr: '', stdOut: '' };
        executor.mockReturnValueOnce(Promise.resolve(mockedResult));
        const args = ['a', 'b', 'c'];
        const result = await main.executeGJF(11, args);
        expect(result).toEqual(mockedResult);
        expect(executor).lastCalledWith(
            'java',
            [
                '--add-exports',
                'jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED',
                '--add-exports',
                'jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED',
                '--add-exports',
                'jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED',
                '--add-exports',
                'jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED',
                '--add-exports',
                'jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED',
                '-jar',
                executablePath,
                'a',
                'b',
                'c',
            ],
            { ignoreReturnCode: false }
        );
    });
});