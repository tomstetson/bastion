const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

test('DMG background adapter preserves file/callback API and rejects invalid images', async () => {
  const sizeOf = require('appdmg/lib/image-size');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bastion-image-'));
  try {
    const image = path.join(dir, 'background.png');
    await fs.writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlGQAAAAASUVORK5CYII=', 'base64'));
    const read = (file) => new Promise((resolve, reject) => sizeOf(file, (error, value) => error ? reject(error) : resolve(value)));
    assert.deepEqual((({width, height}) => ({width, height}))(await read(image)), {width: 1, height: 1});
    await fs.writeFile(image, 'invalid image');
    await assert.rejects(read(image));
    await assert.rejects(read(path.join(dir, 'missing.png')), {code: 'ENOENT'});
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

test('Packager extraction accepts files and rejects escaping symlinks', async () => {
  const packagerRequire = createRequire(require.resolve('@electron/packager'));
  const extract = packagerRequire('extract-zip').default;
  assert.equal(typeof extract, 'function');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bastion-archive-'));
  try {
    for (const target of [null, '../outside', path.join(dir, 'outside')]) {
      const zip = path.join(dir, 'input.zip');
      const dest = path.join(dir, 'output');
      await fs.rm(dest, {recursive: true, force: true});
      execFileSync('python3', ['-c', 'import zipfile,sys,stat\nz=zipfile.ZipFile(sys.argv[1],"w")\nif sys.argv[2]:\n i=zipfile.ZipInfo("link");i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,sys.argv[2]);z.writestr("link/escaped.txt","bad")\nelse:z.writestr("nested/valid.txt","good")\nz.close()', zip, target || '']);
      if (target) {
        await assert.rejects(extract(zip, {dir: dest}));
        await assert.rejects(fs.stat(path.join(dir, 'outside')), {code: 'ENOENT'});
      } else {
        await extract(zip, {dir: dest});
        assert.equal(await fs.readFile(path.join(dest, 'nested/valid.txt'), 'utf8'), 'good');
      }
    }
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
