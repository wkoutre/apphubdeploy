#!/usr/bin/env node --harmony

var fs           = require('fs');
var open         = require('open');
var package      = require('./package.json');
var path         = require('path');
var program      = require('commander');
var readlineSync = require('readline-sync');

var APP_HUB_ID;
var APP_HUB_SECRET;
var BUILD_FILE_NAME = 'AppHubBuild_' + Date.now() + '.zip';
var BUILD_FILE_PATH = path.resolve('./', BUILD_FILE_NAME);
var BUILD_URL_BASE  = 'https://dashboard.apphub.io/projects/';
var BUILD_URL;

program
  .version(package.version)
  .option('-a, --app-versions <app-versions>',     'App Versions separated by commas that are compatible with this build. Either do not use a space in between version or wrap it in quotes. Example: -a 1.0.3,1.0.4 Defaults to value in info.plist of build file.' )
  .option('-c, --configure',                       '(Re)Configure AppHub ID and Secret key.')
  .option('-d, --build-description <description>', 'Description of the build. Wrap in quotes if more than one word.')
  .option('-o, --open-build-url',                  'Open AppHub Builds URL after a successful build and deploy.')
  .option('-n, --build-name <name>',               'Name of the build. Wrap in quotes if more than one word.')
  .option('-r, --retain-build',                    'Do not remove the build after a successful deploy. By default it will be removed.')
  .option('-t, --target <target>',                 'One of [all, debug, none] which specifies the target audience of the build. Defaults to none.')
  .option('-v, --verbose',                         'Unleashes the "Chatty Kathy" to the STDOUT - great for debugging!')
  .parse(process.argv);

checkOptionValues();

if (program.configure) {
  setup();
}
else {
  readPreviouslySavedAppHubCredentials();
}

var BUILD_URL = BUILD_URL_BASE + APP_HUB_ID;

build();

deploy();

if (!program.retainBuild)
  removeBuildFile();

if (program.openBuildUrl)
  openBuildUrl();

process.exit(0);




// Private Functions

function checkOptionValues() {
  permittedValues = ["all", "debug", "none"];

  if (program.target && !permittedValues.includes(program.target)) {
    console.log('-t --target option needs to be one of ' + permittedValues.join(", ") + '.');
    console.log('');
    process.exit(1);
  }
}

function setup() {
  APP_HUB_ID     = readlineSync.question('AppHub App ID: ');
  APP_HUB_SECRET = readlineSync.question('AppHub App Secret: ');

  console.log('');

  var appHubCredentialsAsJSON = JSON.stringify( { "appHubId": APP_HUB_ID, "appHubSecret": APP_HUB_SECRET } );

  try {
    fs.writeFileSync( './.apphub', appHubCredentialsAsJSON, { mode: 0600 } );
  }
  catch (error) {
    console.log('There was an error saving your AppHub config to file.');
    console.log(error.message);
    process.exit(1);
  }

  console.log('AppHub configuration saved to .apphub for future deploys.');
};

function readPreviouslySavedAppHubCredentials() {
  // If run without any .apphub file then run setup.
  var appHubData;
  try {
    var appHubFileData = fs.readFileSync( './.apphub' );
    appHubData = JSON.parse(appHubFileData);

    // If .apphub exists, try and get values.
    if (!appHubData.appHubId.trim() || !appHubData.appHubSecret.trim())
      throw new Error('One or both of your AppHub credentials are blank');

    // .apphub file exists, can be read and the credentials are reasonable (i.e. present and not blank).
    if (program.verbose)
      console.log('Found .apphub file! Reading credentials.');

    APP_HUB_ID     = appHubData.appHubId;
    APP_HUB_SECRET = appHubData.appHubSecret;
  }
  catch (error) {
    if (error.code == 'ENOENT') {
      // If missing file, no problem, we'll kick off the Setup function to create it.
      setup();
    }
    else {
      console.log('The contents of .apphub file were not what we were expecting. Try running with --configure command to re-enter your AppHub credentials.');
      console.log('');
      process.exit(1);
    }
  }
};


function build() {
  console.log('');
  process.stdout.write('Building... ');

  buildResult = require('child_process').execSync( './node_modules/.bin/apphub build --verbose -o ' + BUILD_FILE_NAME ).toString();

  if (program.verbose) {
    console.log(buildResult);
    console.log('');
  }


  process.stdout.write('Done!');
};

function deploy() {
  console.log('');
  process.stdout.write('Deploying... ');

  try {
    // Compile any Meta Data into an Array to be used in the cURL request.
    var metaData = {};
    if (program.target)
      metaData['target'] = program.target;

    if (program.buildName)
      metaData['name'] = program.buildName;

    if (program.buildDescription)
      metaData['description'] = program.buildDescription;

    if (program.appVersions)
      metaData['app_versions'] = program.appVersions;

    var metaDataString = '{ ';

    Object.keys(metaData).forEach( (key, index) => {
      if (index != 0)
        metaDataString += ', ';

      metaDataString += '"' + key + '": ';

      if (key == 'app_versions') {
        metaDataString += '[';

        metaData[key].split(',').forEach( (appVersion, index) => {
          if (index != 0)
            metaDataString += ',';

          metaDataString += '"' + appVersion.trim() + '"';
        })

        metaDataString += ']';
      }
      else {
        metaDataString += '"' + metaData[key] + '"';
      }
    })

    metaDataString += ' }'

    getUrlForPutCommand =  'curl -X GET';
    if (!program.verbose)
      getUrlForPutCommand += ' --silent';
    getUrlForPutCommand += ' -H "X-AppHub-Application-ID: ' + APP_HUB_ID + '"';
    getUrlForPutCommand += ' -H "X-AppHub-Application-Secret: ' + APP_HUB_SECRET + '"';
    getUrlForPutCommand += ' -H "Content-Type: application/zip"';

    // Add Meta Data if any are set with the options.
    if (metaDataString != '{  }')
      getUrlForPutCommand += ' -H \'X-AppHub-Build-Metadata: ' + metaDataString.replace(/'/g, '_') + "'";

    getUrlForPutCommand += ' -L https://api.apphub.io/v1/upload';
    getUrlForPutCommand += ' | python -c \'import json,sys;obj=json.load(sys.stdin);print obj["data"]["s3_url"]\'';

    if (program.verbose) {
      console.log('GET Command:');
      console.log(getUrlForPutCommand);
    }

    urlForPut = require('child_process').execSync( getUrlForPutCommand ).toString().trim();

    if (program.verbose) {
      console.log('urlForPut:');
      console.log(urlForPut);
    }

    putCommand  = 'curl -X PUT';
    if (!program.verbose)
      putCommand += ' --silent';
    putCommand += ' -H "Content-Type: application/zip"';
    putCommand += ' -L "' + urlForPut + '"';
    putCommand += ' --upload-file ' + BUILD_FILE_NAME;

    if (program.verbose) {
      console.log('putCommand:');
      console.log(putCommand);
    }

    putResponse = require('child_process').execSync( putCommand ).toString().trim();

    if (program.verbose) {
      console.log( putResponse );
      console.log('');
    }

    process.stdout.write('Done!');
  }
  catch(error) {
    console.log('');
    console.log('There was a problem uploading the build:');
    console.log(error);

    process.exit(1);
  }

  console.log('');
  console.log('');
  console.log('SUCCESSFULLY BUILT AND DEPLOYED TO APPHUB!')
  console.log('');

  console.log('You can see your build here: ' + BUILD_URL);

};

function removeBuildFile() {
  try {
    console.log('');
    process.stdout.write('Removing Build File... ');

    if (program.verbose) {
      console.log('BUILD_FILE_PATH: ')
      console.log(BUILD_FILE_PATH);
    }

    fs.unlinkSync(BUILD_FILE_PATH)

    process.stdout.write('Done!');
    console.log('');
    console.log('');
  }
  catch(error) {
    console.log('');
    console.log('There was a problem removing the build file: ' + BUILD_FILE_PATH);
    console.log('');
    console.log(error);

    process.exit(1);
  }
}

function openBuildUrl() {
  console.log('Opening AppHub Builds in your browser...');

  open(BUILD_URL);
};
