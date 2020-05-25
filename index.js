const core = require('@actions/core');
const exec = require('@actions/exec');
const glob = require('@actions/glob');

const executable = `${process.env.HOME}/google-java-format.jar`;

async function executeGJF(args, files) {
    let arguments = ['-jar', executable].concat(args.split(" "));
    if (files !== undefined) {
        for (const file of files) { arguments.push(file); }
    }
    const options = { cwd: process.env.GITHUB_WORKSPACE }
    await exec.exec('java', arguments, options);
}

async function execAndGetOutput(command, getStdErr = false) {
    let output = '';
    const options = {
        silent: true,
        ignoreReturnCode: false,
        listeners: {
            stdout: (data) => getStdErr ? core.info(data.toString()) : output += data.toString(),
            stderr: (data) => getStdErr ? output += data.toString() : core.info(data.toString())
        }
    };
    await exec.exec(command, null, options);
    return output;
}

async function run() {
    try {
        // Determine version of Java SDK
        core.startGroup('Checking current JDK');
        let javaVersion = await execAndGetOutput('java -version', true);
        core.debug(javaVersion);
        javaVersion = javaVersion
            .split('\n')[0]
            .match(RegExp('[0-9\.]+'))[0];
        core.debug(`Extracted version number: ${javaVersion}`);
        if (javaVersion.startsWith('1.')) javaVersion = javaVersion.replace(RegExp('^1\.'), '');
        javaVersion = javaVersion.split('\.')[0];
        javaVersion = parseInt(javaVersion);

        // 14891293 is the id of GJF 1.7
        // Later versions require Java SDK 11+
        let releaseId = 'latest';
        if (isNaN(javaVersion)) core.warning('Cannot determine JDK version');
        else {
            core.info(`Version of JDK: ${javaVersion}`);
            if (javaVersion < 11) {
                core.warning('Latest versions of Google Java Format require Java SDK 11 min. Fallback to Google Java Format 1.7.');
                releaseId = '14891293';
            }
        }
        core.endGroup();

        // Get Google Java Format executable and save it to [executable]
        core.startGroup('Downloading Google Java Format');
        const urlRelease = `https://api.github.com/repos/google/google-java-format/releases/${releaseId}`;
        core.debug(`URL: ${urlRelease}`);
        const release = JSON.parse(await execAndGetOutput(`curl -s "${urlRelease}"`));
        const assets = release['assets'];
        const downloadUrl = assets.find(asset => asset['name'].endsWith('all-deps.jar'))['browser_download_url'];
        core.info(`Downloading executable to ${executable}`);
        await exec.exec(`curl -sL ${downloadUrl} -o ${executable}`);
        await executeGJF('--version');
        core.endGroup();

        // Execute Google Java Format with provided arguments
        const args = core.getInput('args');
        core.debug(`Arguments: ${args}`);
        const files = await (await glob.create(core.getInput('files'))).glob();
        await executeGJF(args, files);

        // Commit changed files if there are any and if skipCommit != true
        if (core.getInput('skipCommit').toLowerCase() !== 'true') {
            core.startGroup('Committing changes');
            const options = { silent: true };
            await exec.exec('git', ['config', 'user.name', 'GitHub Actions'], options);
            await exec.exec('git', ['config', 'user.email', ''], options);
            options.silent = false;
            options.ignoreReturnCode = true;
            await exec.exec('git', ['commit', '-m', 'Google Java Format', '--all'], options);
            await exec.exec('git', ['push'], options);
            core.endGroup();
        }
    } catch (message) {
        core.setFailed(message);
    }
}

run()
