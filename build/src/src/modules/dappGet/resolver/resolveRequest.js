const verifyState = require('./verifyState');
const getPkgsToInstall = require('./getPkgsToInstall');
const getStatePkgToInstall = require('./getStatePkgToInstall');
const prioritizeVersions = require('./prioritizeVersions');
const {getPermutation, getPermutationsTable} = require('./permutations');
const {filterObj} = require('../utils/objUtils');
const mergePkgs = require('../utils/mergePkgs');

/**
 * Resolves a request given a repository of package dependencies and a state
 * It will try to find a compatible combination of versions
 *
 * If it succeeds, and there are various results it will return the one where
 * - The requested package has the highest version
 * - The already installed packages have the closest version to the current one
 * - Newly installed packages have the highest versions
 * This three conditions are prioritized as this list's order.
 *
 * If it does not find a valid combination it will return a list of packages
 * which caused incompatibilities ordered by number of a times they caused
 * an incompatibility
 */

const timeoutMs = 10 * 1000; // ms

function resolveRequest(req, repo, state) {
    let name; let ver;
    if (typeof req === 'object') {
        name = req.name;
        ver = req.ver;
    } else {
        [name, ver] = req.split('@');
    }
    const errors = {};
    let success;

    // Compute packages to install
    let pkgToInstall = getPkgsToInstall(name, ver, repo);

    // Append affected state packages
    const statePkgToInstall = getStatePkgToInstall(pkgToInstall, state, repo);
    pkgToInstall = mergePkgs(pkgToInstall, statePkgToInstall);
    pkgToInstall = prioritizeVersions(pkgToInstall, name, ver, state);
    // pkgToInstall sample contents
    //  { A: [ '2.0.0' ],
    //  C: [ '2.0.0', '1.0.0' ],
    //  B: [ '1.0.0', '1.1.0', '2.0.0' ] }

    const {x: permutationsTable, m: totalCases} = getPermutationsTable(pkgToInstall, name, state);

    // ####### debug
    // console.log('permutationsTable', permutationsTable);

    const now = Date.now();
    let hasTimedOut = false;
    let caseId;
    for (caseId=0; caseId<totalCases; caseId++) {
        // Creates a states from all the possible permutations
        // { A: '2.0.0', B: '1.0.0', C: '2.0.0' }
        let obj = getPermutation(permutationsTable, caseId);
        // Check if this combination of versions is valid
        const result = verifyState(obj, repo);
        if (result.valid) {
            success = obj;
            break;
        } else {
            // Keep track of how many incompatibilities are due to a specific reason
            const {req, dep, range} = result.reason;
            const key = `${req}#${dep}#${range}`;
            key in errors ? errors[key]++ : errors[key] = 1;
        }
        // Prevent the for loop to run for too long
        if (Date.now() - now > timeoutMs) {
            hasTimedOut = true;
            break;
        }
    }

    if (success) {
        // Prepare the success result
        // 1. Filter out packages that will not be installed
        success = filterObj(success, ((ver) => ver));
        // 2. Filter the state by packages that are relevant to this success case
        state = filterObj(state, ((pkg) => Object.keys(success).includes(pkg)), true);
        // // 3. Filter out packages that will not be updated
        // Object.keys(success).forEach((pkg) => {
        //     if (success[pkg] === state[pkg]) {
        //         delete success[pkg];
        //         delete state[pkg];
        //     }
        // });
    }

    // Format an error message
    let error;
    if (!success) {
        // Timeout message
        if (hasTimedOut) error = `Resolver timed out (${timeoutMs} ms). \n`;
        else error = '';
        // Blame message
        try {
            const blameDep = {};
            const blameDepReq = {};
            for (const key of Object.keys(errors)) {
                const [_req, _dep] = key.split('#');
                const req = _req.split('@')[0];
                const dep = _dep.split('@')[0];
                blameDep[dep] = (blameDep[dep] || 0) + errors[key];
                if (!blameDepReq[dep]) blameDepReq[dep] = {};
                blameDepReq[dep][req] = true;
            }
            const highestDep = Object.keys(blameDep)
                .reduce((a, b) => blameDep[a] > blameDep[b] ? a : b);
            const blamePackages = Object.keys(blameDepReq[highestDep]).join(', ');
            error += `Packages ${blamePackages} request incompatible versions of ${highestDep}`;
        } catch (e) {
            // Ignore possible errors from the message processing
        }
        error += `Checked ${caseId}/${totalCases} total cases \n`;
        // Cases checked message
        error += `Checked ${caseId}/${totalCases} total cases \n`;
    }


    return {
        // Some package can have null version because they don't have to be installed
        // Don't include them in the result
        success,
        error,
        state,
    };
}

module.exports = resolveRequest;
