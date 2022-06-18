'use strict';

const path = require('path');
const glob = require('glob-promise');

const AdmZip = require("adm-zip");

async function main() {
  const zip = new AdmZip();
  const distDirPath = path.join('.', 'dist');
  const zipfilePath = path.join(distDirPath, 'lambda.zip');
  const jsFiles = await glob('dist/*.js');
  jsFiles.forEach(jsFile => {
    console.log(`adding ${jsFile}`)
    zip.addLocalFile(jsFile);
  })
  const node_modules = path.join('.', 'node_modules');
  console.log(`adding ${node_modules}`)
  zip.addLocalFolder(node_modules, "node_modules");
  zip.writeZip(zipfilePath);
  console.log(`Created ${zipfilePath} successfully`);
}

main();