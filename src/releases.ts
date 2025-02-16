import * as github from '@actions/github';
import { CommandExecutor } from './exec';
import { repositoryName as GJF_REPO_NAME, repositoryOwner as GJF_REPO_OWNER } from './const';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

type ReleaseDataArray = RestEndpointMethodTypes['repos']['listReleases']['response']['data'];
export type ReleaseData = ReleaseDataArray[0];
export type Octokit = ReturnType<typeof github.getOctokit>;

export class Releases {
    private static readonly apiReleases = `https://api.github.com/repos/${GJF_REPO_OWNER}/${GJF_REPO_NAME}/releases`;
    private readonly execute: CommandExecutor;
    private readonly octokit: Octokit | undefined;

    constructor(execute: CommandExecutor, octokit?: Octokit) {
        this.execute = execute;
        this.octokit = octokit;
    }

    private async callReleasesApi(): Promise<ReleaseData[]>;
    private async callReleasesApi(pathParameter: string | number): Promise<ReleaseData>;
    private async callReleasesApi(pathParameter?: number): Promise<ReleaseData | ReleaseData[]>;
    private async callReleasesApi(pathParameter?: string | number): Promise<ReleaseData | ReleaseData[]> {
        const url = `${Releases.apiReleases}${pathParameter || ''}`;
        const response = await this.execute('curl', ['-sL', url], { ignoreReturnCode: false });
        return JSON.parse(response.stdOut);
    }

    async getAllReleaseData(): Promise<ReleaseData[]> {
        if (!this.octokit) {
            return this.callReleasesApi();
        }
        const params = { owner: GJF_REPO_OWNER, repo: GJF_REPO_NAME };
        const response = await this.octokit.rest.repos.listReleases(params);
        return response.data;
    }

    async getLatestReleaseData(): Promise<ReleaseData> {
        if (!this.octokit) {
            return this.callReleasesApi('/latest');
        }
        const params = { owner: GJF_REPO_OWNER, repo: GJF_REPO_NAME };
        const response = await this.octokit.rest.repos.getLatestRelease(params);
        return response.data;
    }

    async getReleaseDataByName(releaseName: string): Promise<ReleaseData | undefined> {
        const allReleaseData = await this.getAllReleaseData();
        return allReleaseData.find(r => r.name === releaseName);
    }
}