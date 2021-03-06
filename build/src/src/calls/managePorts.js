const docker = require('modules/docker');


/**
 * Open or closes requested ports
 *
 * @param {Object} kwargs: {
 *   action: 'open' or 'close' (string)
 *   ports: array of numerical ports [5000, 5001] (array)
 * }
 * @return {Object} A formated success message.
 * result: empty
 */
const managePorts = async ({
    action,
    ports,
}) => {
    if (!Array.isArray(ports)) {
        throw Error('ports variable must be an array: '+JSON.stringify(ports));
    }

    let msg;
    for (const port of ports) {
        switch (action) {
            case 'open':
                await docker.openPort(port);
                msg = 'Opened';
                break;
            case 'close':
                await docker.closePort(port);
                msg = 'Closed';
                break;
            default:
                throw Error('Unkown manage ports action: '+action);
        }
    }

    return {
        message: msg+' ports '+ports.join(', '),
        logMessage: true,
        userAction: true,
    };
};


module.exports = managePorts;
