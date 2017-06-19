'use strict';

const _ = require('lodash');

const Lease = require('./Lease');
const errors = require('./errors');

const VaultApiClient = require('./VaultApiClient');

const VaultAppRoleAuth = require('./auth/VaultAppRoleAuth');
const VaultTokenAuth = require('./auth/VaultTokenAuth');
const VaultIAMAuth = require('./auth/VaultIAMAuth');

const VaultNodeConfig = require('./VaultNodeConfig');

const vaultInstances = {};

class Vault {

    /**
     * Client constructor function.
     * @param {Object} options
     * @param {Object} options.api
     * @param {String} options.api.url - the url of the vault server
     * @param {String} [options.api.apiVersion='v1']
     * @param {Object} options.auth
     * @param {String} options.auth.type
     * @param {Object} options.auth.config - auth configuration variables
     * @param {Object|false} options.logger - Logger that supports "error", "info", "warn", "trace", "debug" methods. Uses `console` by default. Pass `false` to disable logging.
     */
    constructor(options) {
        this.__api = new VaultApiClient(options.api);
        this.__log = this.__setupLogger(options.logger);

        /** @type {VaultBaseAuth} */
        this.__auth = null;
        if (options.auth.type === 'appRole') {
            this.__auth = new VaultAppRoleAuth(
                this.__api,
                this.__log,
                options.auth.config,
                options.auth.mount
            );
        } else if (options.auth.type === 'token') {
            this.__auth = new VaultTokenAuth(
                this.__api,
                this.__log,
                options.auth.config,
                options.auth.mount
            );
        }
        else if(options.auth.type === 'iam') {
            this.__auth =  new VaultIAMAuth(
                this.__api,
                this.__log,
                options.auth.config,
                options.auth.mount
            );
        } else {
            throw new errors.InvalidArgumentsError('Unsupported auth method');
        }
    }

    /**
     * Boot an instance of Vault
     *
     * The instance will be stored in a local hash. Calling Vault.boot multiple
     * times with the same name will return the same instance.
     *
     * @param {String} name
     * @param {Object} [options] - options for {@link Vault#constructor}.
     * @return Vault
     */
    static boot(name, options) {
        if (options === undefined) {
            throw new errors.InvalidArgumentsError('Options should be provided');
        }

        let instance = vaultInstances[name];
        if (instance === undefined) {
            vaultInstances[name] = instance = new Vault(options);

            return instance;
        }

        throw new errors.InvalidArgumentsError('Instance with such name already booted');
    }

    /**
     * Get an instance of Vault
     *
     * The instance will be stored in a local hash. Calling Vault.pop multiple
     * times with the same name will return the same instance.
     *
     * @param {String} name
     * @return Vault
     */
    static get(name) {
        let instance = vaultInstances[name];

        if (instance === undefined) {
            throw new errors.InvalidArgumentsError('Invalid instance name');
        }

        return instance;
    }

    /**
     * Clear named Vault instance
     *
     * If no name passed all named instances will be cleared.
     *
     * @param {String} [name]
     */
    static clear(name) {
        if (typeof name === 'string') {
            delete vaultInstances[name];
        } else {
            for (let k in vaultInstances){
                if (vaultInstances.hasOwnProperty(k)){
                    delete vaultInstances[k];
                }
            }
        }
    }

    /**
     * Populates Vault's values to NPM "config" module
     */
    fillNodeConfig() {
        const vaultConf = new VaultNodeConfig(this);

        return vaultConf.populate();
    }

    read(path) {
        return this.__auth.getAuthToken().then(token => {
            return this.__api.makeRequest('GET', path, null, {'X-Vault-Token': token.getId()});
        }).then(res => {
            return Lease.fromResponse(res);
        });
    }

    write(path, data) {
        return this.__auth.getAuthToken().then(token => {
            return this.__api.makeRequest('POST', path, data, {'X-Vault-Token': token.getId()});
        }).then(() => {});
    }

    __setupLogger(logger) {
        if (logger === false) {
            return {
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                trace: () => {},
            }
        } else if (_.intersection(_.functionsIn(logger), ['error', 'warn', 'info', 'debug', 'trace']).length >= 5) {
            return logger
        } else {
            return console;
        }
    }
}

module.exports = Vault;
