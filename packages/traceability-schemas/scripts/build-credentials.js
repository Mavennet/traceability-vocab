const path = require('path');
const fs = require('fs-extra');
const { Ed25519KeyPair } = require('@transmute/did-key-ed25519');
const { Ed25519Signature2018 } = require('@transmute/ed25519-signature-2018');
const vcjs = require('@transmute/vc.js');
const { documentLoader } = require('../src/data/vc/documentLoader');

console.log('🧪 Initializing credential builder');
const schemas = require('../index.js');

const contextArray = new Set([]);

// if the key is found, delete the key and add the value to the contextArraySet
// if not available and is an object recurse deeper

function findAllByKey(obj, keyToFind) {
  return Object.entries(obj)
    .reduce((acc, [key, value]) => {
      if (key === keyToFind) {
        contextArray.add(...value);
        // eslint-disable-next-line
        delete obj[key];
        return acc.concat(value);
      }
      if ((typeof value === 'object')) {
          return acc.concat(findAllByKey(value, keyToFind));
      }
      return acc;
      }, []);
}

const issueCreds = async (credTemplate, schemaName) => {
  try {
    const key = Ed25519KeyPair.from(require('../src/data/vc/keypair.json'));

    // deep copy
    let credentialPayload = JSON.parse(JSON.stringify(credTemplate));
    // allow for custom VC properties....
    // hacky...
    if (
      credentialPayload.credentialSubject.type[0] === 'VerifiableCredential'
    ) {
      credentialPayload = credentialPayload.credentialSubject;
      if (typeof credentialPayload.issuer === 'string') {
        credentialPayload.issuer = key.controller;
      } else {
        credentialPayload.issuer.id = key.controller;
      }
    } else {
      // eslint-disable-next-line
      delete credTemplate.credentialSubject['@context'];
    }

    const verifiableCredential = await vcjs.ld.issue({
      credential: credentialPayload,
      suite: new Ed25519Signature2018({
        key,
        date: '2019-12-11T03:50:55Z',
      }),
      documentLoader,
    });
    const result = await vcjs.ld.verifyCredential({
      credential: verifiableCredential,
      suite: new Ed25519Signature2018(),
      documentLoader,
    });
    // console.log(result)
    if (result.verified) {
      const vcFile = path.resolve(
        __dirname,
        `../src/__fixtures__/${schemaName}/vc.json`
      );
      if (process.env.VERBOSE_BUILD) {
        console.log('Writing credential example to:', vcFile);
      }
      fs.outputFileSync(vcFile, JSON.stringify(verifiableCredential, null, 2));
    } else {
      console.log('Error verifying credential for:', schemaName);
    }
  } catch (credentialError) {
    console.warn(
      'Could not issue Credential:',
      schemaName,
      '\n',
      credentialError
    );
    if (process.env.FULL_ERROR_HANDLING) {
      process.exit(1);
    }
  }
};

const credPromises = [];
Object.keys(schemas).forEach((schemaName) => {
  if (process.env.VERBOSE_BUILD) {
    console.log('Generating credentials for:', schemaName);
  }
  const exampleFile = path.resolve(
    __dirname,
    `../src/__fixtures__/${schemaName}/credential.json`
  );
  if (!fs.existsSync(exampleFile)) {
    console.warn(
      `No good example for ${schemaName} to generate credential from`
    );
  } else {
    try {
      if (process.env.VERBOSE_BUILD) {
        console.log('Generating credential for:', schemaName);
      }
      let credTemplate = JSON.parse(fs.readFileSync(exampleFile));
      findAllByKey(credTemplate, '@context');
      credTemplate = { '@context': Array.from(contextArray), ...credTemplate };
      credPromises.push(issueCreds(credTemplate, schemaName));
    } catch (fileErr) {
      console.log('Error reading credential template for schema:', schemaName);
    }
  }
});

Promise.allSettled(credPromises).then((results) => results.forEach((result) => {
    // noop
    if (process.env.VERBOSE_BUILD) {
      console.log(result.status);
    }
  }));
