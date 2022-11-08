var config = {
    logLevel: 'DEBUG',
    contextBroker: {
        host: '0.0.0.0',
        port: '1026'
    },
    server: {
        port: 4041
    },
    deviceRegistry: {
        type: 'mongodb'
    },
    mongodb: {
        host: '0.0.0.0',
        port: '27017',
    },
    types: {},
    service: 'openiot',
    subservice: '/',
    providerUrl: 'http://192.168.56.1:4041',
    deviceRegistrationDuration: 'P1M',
    defaultType: 'Thing'
};

module.exports = config;