import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Octokit, ReleaseData, Releases } from "../src/releases";
import { CommandExecutor } from "../src/exec";

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

const dummyReleaseData_1_7 = { ...dummyReleaseData, name: '1.7' };
const dummyReleaseData_v1_24_0 = { ...dummyReleaseData, name: 'v1.24.0' };
const allReleases = [dummyReleaseData, dummyReleaseData_1_7, dummyReleaseData_v1_24_0];

const executor = jest.fn<CommandExecutor>();
type ListReleases = Octokit['rest']['repos']['listReleases'];
type GetLatestRelease = Octokit['rest']['repos']['getLatestRelease'];
const mockListReleases = jest.fn<ListReleases>();
const mockGetLatestRelease = jest.fn<GetLatestRelease>();
const octokit = {
    rest: {
        repos: {
            listReleases: mockListReleases,
            getLatestRelease: mockGetLatestRelease,
        }
    }
} as unknown as Octokit;

beforeEach(() => {
    jest.clearAllMocks();
})

function expectLastCurlCallForUrl(url: string) {
    expect(executor).lastCalledWith('curl', ['-sL', url], { ignoreReturnCode: false });
}

function mockApiReturn(stdOut: string) {
    executor.mockReturnValueOnce(Promise.resolve({
        exitCode: 0,
        stdOut,
        stdErr: '',
    }));
}

function mockApiReturnReleases() {
    mockApiReturn(JSON.stringify(allReleases));
}

function mockApiReturnRelease(releaseData: ReleaseData) {
    mockApiReturn(JSON.stringify(releaseData));
}

function mockOctokitReturnReleases() {
    mockListReleases.mockReturnValueOnce(Promise.resolve({
        headers: undefined as any,
        status: 200,
        url: '',
        data: allReleases
    }));
}

function mockOctokitReturnRelease(releaseData: ReleaseData) {
    mockGetLatestRelease.mockReturnValueOnce(Promise.resolve({
        headers: undefined as any,
        status: 200,
        url: '',
        data: releaseData
    }));
}

const URL_BASE = "https://api.github.com/repos/google/google-java-format/releases";

describe('get all release data', () => {
    test('get all release data with API', async () => {
        mockApiReturnReleases();
        const releases = new Releases(executor);
        const results = await releases.getAllReleaseData();
        expect(results).toEqual(allReleases);
        // IMPORTANT: should not have a trailing slash
        expectLastCurlCallForUrl(URL_BASE);
    });

    test('get all release data with API and call to API fails', async () => {
        const error = new Error("Command 'curl ...' failed with exit code 1");
        executor.mockReturnValueOnce(Promise.reject(error));
        const releases = new Releases(executor);
        expect(() => releases.getAllReleaseData())
            .rejects
            .toThrow(error)
        // IMPORTANT: should not have a trailing slash
        expectLastCurlCallForUrl(URL_BASE);
    });

    test('get all release data with octokit', async () => {
        mockOctokitReturnReleases();
        const releases = new Releases(executor, octokit);
        const results = await releases.getAllReleaseData();
        expect(results).toEqual(allReleases);
        expect(mockGetLatestRelease).not.toBeCalled();
        expect(executor).not.toBeCalled();
    });
});

describe('get latest release data', () => {
    const casesJavaVersions: [number, ReleaseData][] = [[8, dummyReleaseData_1_7], [11, dummyReleaseData_v1_24_0]];

    describe('get latest release data with API', () => {
        const releases = new Releases(executor);

        test.each(casesJavaVersions)('when java version is %i, then return release %o', async (javaVersion, expectedRelease) => {
            mockApiReturnReleases();
            const result = await releases.getLatestReleaseData(javaVersion);
            expect(result).toEqual(expectedRelease);
            // IMPORTANT: should not have a trailing slash
            expectLastCurlCallForUrl(URL_BASE);
        });

        test('when java version is 21, then return release latest', async () => {
            mockApiReturnRelease(dummyReleaseData);
            const result = await releases.getLatestReleaseData(21);
            expect(result).toEqual(dummyReleaseData);
            expectLastCurlCallForUrl(URL_BASE + "/latest");
        });
    });

    test('get latest release data with API and call to API fails', async () => {
        const error = new Error("Command 'curl ...' failed with exit code 1");
        executor.mockReturnValueOnce(Promise.reject(error));
        const releases = new Releases(executor);
        expect(() => releases.getLatestReleaseData(21))
            .rejects
            .toThrow(error);
        expectLastCurlCallForUrl(URL_BASE + "/latest");
    });

    describe('get latest release data with octokit', () => {
        const releases = new Releases(executor, octokit);

        test.each(casesJavaVersions)('when java version is %i, then return release %o', async (javaVersion, expectedRelease) => {
            mockOctokitReturnReleases();
            const result = await releases.getLatestReleaseData(javaVersion);
            expect(result).toEqual(expectedRelease);
            expect(executor).not.toBeCalled();
        });

        test('when java version is 21, then return latest release', async () => {
            mockOctokitReturnRelease(dummyReleaseData);
            const result = await releases.getLatestReleaseData(21);
            expect(result).toEqual(dummyReleaseData);
            expect(executor).not.toBeCalled();
        });
    });
});

describe('get release by name', () => {
    test('get release by name (existing)', async () => {
        mockApiReturnReleases();
        const releases = new Releases(executor);
        const result = await releases.getReleaseDataByName('dummy-release-data');
        expect(result).toEqual(dummyReleaseData);
        // IMPORTANT: should not have a trailing slash
        expectLastCurlCallForUrl(URL_BASE);
    });

    test('get release by name (non-existing)', async () => {
        mockApiReturnReleases();
        const releases = new Releases(executor);
        const result = await releases.getReleaseDataByName('non-existing-data');
        expect(result).toBeUndefined();
        // IMPORTANT: should not have a trailing slash
        expectLastCurlCallForUrl(URL_BASE);
    });
});