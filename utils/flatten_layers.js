const fs = require('fs');
const path = require('path');

const projectRoot = process.env.INIT_CWD;
const srcDirPath = `${projectRoot}/${process.argv[2]}`;
const destDirPath = process.argv[3] || `${projectRoot}/generated-files/wip/hashlips-layers`;

if (fs.existsSync(destDirPath)) {
  fs.rmSync(destDirPath, { recursive: true });
}
fs.mkdirSync(destDirPath);

for (const layerDir of fs.readdirSync(srcDirPath)) {
  const layerDirPath = path.join(srcDirPath, layerDir);
  if (fs.lstatSync(layerDirPath).isDirectory()) {
    fs.mkdirSync(`${destDirPath}/${layerDir}`);
    for (const dir of fs.readdirSync(layerDirPath)) {
      const dirPath = path.join(layerDirPath, dir);
      if (fs.statSync(dirPath).isDirectory()) {
        for (const file of fs.readdirSync(dirPath)) {
          const filePath = path.join(dirPath, file);
          fs.copyFileSync(filePath, path.join(destDirPath, layerDir, file));
        }
      }
    }
  }
}