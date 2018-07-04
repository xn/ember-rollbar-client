/* eslint-env node */
const fs = require('fs');
const gitRepoVersion = require('git-repo-version');
const fetch = require('node-fetch');
const RSVP = require('rsvp');
const FormData = require('form-data');

const rollbarUrl = 'https://api.rollbar.com/api/1/sourcemap';

function codeVersion() {
  const versionWithSha = gitRepoVersion({ shaLength: 7 })
  const shaOnly = versionWithSha.split("+")[1]
  return shaOnly;
}

module.exports = {
  name: 'upload-rollbar-sourcemaps',
  description: 'Upload sourcemaps to rollbar.',
  works: 'insideProject',

  availableOptions: [
    { name: 'token', type: String, aliases: ['t'], required: true },
    { name: 'host', type: String, aliases: ['h'], required: true },
    { name: 'version', type: String, aliases: ['v'], default: codeVersion() },
    { name: 'assets-dir', type: String, default: 'dist/assets', aliases: ['d'] },
    { name: 'assets-url', type: String, default: 'assets', aliases: ['p'] },
  ],

  run(options) {
    let host = options.host;
    let token = options.token;
    let version = options.version;
    let assetsDir = options.assetsDir;
    let assetsUrl = options.assetsUrl;

    let assetsPath = `${this.project.root}/${assetsDir}`;
    let assets = fs.readdirSync(assetsPath);
    let jsFiles = assets.filter((path) => /\.js$/.test(path));
    let mapFiles = jsFiles.map((jsFile) => jsFile.replace(/(js)$/, "map"))

    this.ui.writeLine('Uploading to Rollbar...');

    let promises = jsFiles.map((jsFile) => {
      const idx = jsFiles.indexOf(jsFile);
      return this._uploadToRollbar(host, version, token, assetsUrl, assetsPath, jsFile, mapFiles[idx]);
    });

    return RSVP.all(promises).then(() => this.ui.writeLine('Uploading completed successfully!'));
  },

  _uploadToRollbar(host, version, token, assetsUrl, assetsPath, jsFile, mapFile) {
    const formData = new FormData();
    const jsFilePath = `${host}/${assetsUrl}/${jsFile}`;
    const mapFilePath = `${assetsPath}/${mapFile}`;
    const fileSize = fs.statSync(mapFilePath)['size'];

    formData.append('version', version);
    formData.append('access_token', token);
    formData.append('minified_url', jsFilePath);
    formData.append('source_map', fs.createReadStream(mapFilePath), { knownLength: fileSize });

    return fetch(rollbarUrl, { method: 'POST', body: formData })
      .then((res) => res.json())
      .then((json) => {
        if (json.err) {
          this.ui.writeLine('Notifying error!');
          throw `Rollbar status: '${json.message}'`;
        } else {
          this.ui.writeLine(`Reported file: '${jsFilePath}'`);
        }
      });
  }
}
