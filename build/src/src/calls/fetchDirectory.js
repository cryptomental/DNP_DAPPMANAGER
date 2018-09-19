const getDirectory = require('modules/getDirectory');
const {eventBus, eventBusTag} = require('eventBus');
const logs = require('logs.js')(module);
const getManifest = require('modules/getManifest');
const base64Img = require('base64-img');
const ipfs = require('modules/ipfs');
const params = require('params');
const parse = require('utils/parse');

let packagesCache;

function emitPkg(pkg) {
  const pkgsObj = {
    [pkg.name]: pkg,
  };
  eventBus.emit(eventBusTag.emitDirectory, pkgsObj);
}

function emitPkgs(pkgs) {
  const pkgsObj = {};
  for (const pkg of pkgs) {
    pkgsObj[pkg.name] = pkg;
  }
  eventBus.emit(eventBusTag.emitDirectory, pkgsObj);
}

/**
 * Fetches all package names in the custom dappnode directory.
 * This feature helps the ADMIN UI load the directory data faster.
 *
 * @param {Object} kwargs: {}
 * @return {Object} A formated success message.
 * result: packages =
 *   [
 *     {
 *       name: packageName, (string)
 *       status: 'Preparing', (string)
 *       currentVersion: '0.1.2' or null, (String)
 *     },
 *     ...
 *   ]
 */
const fetchDirectory = async () => {
  // Make sure the chain is synced
  // if (await ethchain.isSyncing()) {
  //   return res.success('Mainnet is syncing', []);
  // }

  // Emit a cached version right away
  if (packagesCache && Array.isArray(packagesCache)) {
    emitPkgs(packagesCache);
  }

  // List of available packages in the directory
  // Return an array of objects:
  //   [
  //     {
  //       name: packageName,  (string)
  //       status: 'Preparing' (string)
  //     },
  //     ...
  //   ]
  const packages = await getDirectory();

  // Extend package object contents
  packagesCache = await Promise.all(packages.map(async (pkg) => {
    const {name} = pkg;
    emitPkg(pkg);

    // Now resolve the last version of the package
    const manifest = await getManifest(parse.packageReq(name));
    // Correct manifest
    if (!manifest.type) manifest.type = 'library';
    emitPkg({name, manifest});

    // Fetch the package image
    const avatarHash = manifest.avatar;
    let avatar;
    if (avatarHash) {
      try {
        await ipfs.cat(avatarHash);
        avatar = base64Img.base64Sync(params.CACHE_DIR + avatarHash);
        emitPkg({name, avatar});
      } catch (e) {
        // If the avatar can not be fetched don't crash
        logs.error('Could not fetch avatar of '+name+' at '+avatarHash+': '+e.message);
      }
    }

    // Merge results and return
    return {
      ...pkg,
      manifest,
      avatar,
    };
  }));

  return {
    message: 'Listed directory with ' + packagesCache.length + ' packages',
    result: packagesCache,
    logMessage: true,
  };
};


module.exports = fetchDirectory;