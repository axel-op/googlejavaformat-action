const core = require('@actions/core');
const exec = require('@actions/exec');
const glob = require('@actions/glob');

const executable = `${process.env.HOME}/google-java-format.jar`;

async function executeGJF(args, files) {
    let arguments = ['-jar', executable].concat(args.split(" "));
    if (files !== null) {
        for (const file of files) { arguments.push(file); }
    }
    const options = { cwd: process.env.GITHUB_WORKSPACE }
    await exec.exec('java', arguments, options);
}

async function execAndGetOutput(command) {
    let output = '';
    const options = {
        silent: true,
        ignoreReturnCode: false,
        listeners: {
            stdout: (data) => output += data.toString(),
            stderr: (data) => console.error(data)
        }
    };
    await exec.exec(command, null, options);
    return output;
}

async function run() {
    try {
        const urlRelease = 'https://api.github.com/repos/google/google-java-format/releases/latest';
        const latestRelease = JSON.parse(await execAndGetOutput(`curl -s "${urlRelease}"`));
        const assets = latestRelease['assets'];
        const downloadUrl = assets.find(asset => asset['name'].endsWith('all-deps.jar'))['browser_download_url'];
        await exec.exec(`curl -sL ${downloadUrl} -o ${executable}`);
        await executeGJF('--version', null);
        const args = core.getInput('args');
        const files = await (await glob.create(core.getInput('files'))).glob();
        await executeGJF(args, files);
        if (core.getInput('skipCommit').toLowerCase() !== 'true') {
            const options = { silent: true };
            await exec.exec('git', ['config', 'user.name', 'GitHub Actions'], options);
            await exec.exec('git', ['config', 'user.email', ''], options);
            options.silent = false;
            options.ignoreReturnCode = true;
            await exec.exec('git', ['commit', '-m', 'Google Java Format', '--all'], options);
            await exec.exec('git', ['push'], options);
        }
    } catch (message) {
        core.setFailed(message);
    }
}

run()