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

program
  .version(package.version)
  .option('-c, --configure', '(Re)Configure AppHub ID and Secret key')
  .option('-o, --open-build-url', 'Open AppHub Builds URL after a successful build and deploy.')
  .parse(process.argv);

if (program.configure) {
  setup();

  build();
}
else {
  // If run without any .apphub file then run setup.
  fs.readFile( './.apphub', function ( error, data ) {
    if (error) {
      if (error.code != 'ENOENT') {
        console.log('There was a problem with checking your .apphub file for credentials:');
        console.log(error.message);
        process.exit(1);
      }

      // If missing file, no problem, we'll kick off the Setup function to create it.
      setup();
    }
    else {
      // If .apphub exists, try and get values.
      appHubData = JSON.parse(data);

      console.log('.apphub file exists! Reading credentials.');

      APP_HUB_ID     = appHubData.appHubId;
      APP_HUB_SECRET = appHubData.appHubSecret;
    }

    build();
  });
}


function setup() {

  APP_HUB_ID     = readlineSync.question('AppHub App ID: ');
  APP_HUB_SECRET = readlineSync.question('AppHub App Secret: ');

  console.log('');

  appHubCredentialsAsJSON = JSON.stringify( { "appHubId": APP_HUB_ID, "appHubSecret": APP_HUB_SECRET } );

  fs.writeFile( './.apphub', appHubCredentialsAsJSON, { mode: 0600 }, function (error) {
    if (error) {
      console.log('There was an error saving your AppHub config to file.');
      console.log(error.message);
      process.exit(1);
    }
  });

  console.log('AppHub configuration saved to .apphub for future deploys.');
  console.log('');
};


function build() {
  console.log('Building...');

  buildResult = require('child_process').execSync( './node_modules/.bin/apphub build --verbose -o ' + BUILD_FILE_NAME ).toString();

  console.log(buildResult);
  console.log('');
  console.log('BUILD SUCCESSFUL!');
  console.log('');

  deploy();
};

function deploy() {
  console.log('Deploying...');
  console.log('');

  // var curl = require('curlrequest');

  // var curlOptions = {
  //   method: 'PUT',
  //   headers: {
  //     'X-AppHub-Application-ID': APP_HUB_ID,
  //     'X-AppHub-Application-Secret': APP_HUB_SECRET,
  //     'Content-Type': 'application/zip'
  //   },
  //   url: 'https://api.apphub.io/v1/upload',
  //   'upload-file': BUILD_FILE_NAME,
  // };

  // curl.request( curlOptions, function (err, stdout, meta) {
  //   console.log('%s %s', meta.cmd, meta.args.join(' '));
  // });
  // curlCommand =  'curl -X PUT';
  // curlCommand += ' -H "X-AppHub-Application-ID: ' + APP_HUB_ID + '"';
  // curlCommand += ' -H "X-AppHub-Application-Secret: ' + APP_HUB_SECRET + '"';
  // curlCommand += ' -H "Content-Type: application/zip"';
  // curlCommand += ' -L https://api.apphub.io/v1/upload';
  // // curlCommand += ' --include'; // Includes the HTTP header in the output.
  // curlCommand += ' --verbose';
  // curlCommand += ' --upload-file ./' + BUILD_FILE_NAME;
  // curlCommand += ' https://api.apphub.io/v1/upload';


  try {
    getUrlForPutCommand =  'curl -X GET';
    getUrlForPutCommand += ' -H "X-AppHub-Application-ID: ' + APP_HUB_ID + '"';
    getUrlForPutCommand += ' -H "X-AppHub-Application-Secret: ' + APP_HUB_SECRET + '"';
    getUrlForPutCommand += ' -H "Content-Type: application/zip"';
    getUrlForPutCommand += ' -L https://api.apphub.io/v1/upload';
    getUrlForPutCommand += ' | python -c \'import json,sys;obj=json.load(sys.stdin);print obj["data"]["s3_url"]\'';

    urlForPut = require('child_process').execSync( getUrlForPutCommand ).toString().trim();

    console.log('urlForPut:');
    console.log(urlForPut);

    putCommand  = 'curl -X PUT';
    putCommand += ' -H "Content-Type: application/zip"';
    putCommand += ' -L "' + urlForPut + '"';
    putCommand += ' --upload-file ' + BUILD_FILE_NAME;

    console.log('putCommand:');
    console.log(putCommand);

    putResponse = require('child_process').execSync( putCommand ).toString().trim();

    console.log( putResponse );
    console.log('');
    console.log("DEPLOY SUCCESSFUL!");
  }
  catch(error) {
    console.log('');
    console.log('There was a problem uploading the build:');
    console.log(error);

    process.exit(1);
  }

  try {
    console.log('');
    console.log('Removing Build File...');
    console.log('');


    console.log('BUILD_FILE_PATH: ')
    console.log(BUILD_FILE_PATH);

    fs.unlinkSync(BUILD_FILE_PATH)

    console.log('BUILD FILE REMOVED!');
    console.log('');



  }
  catch(error) {
    console.log('');
    console.log('There was a problem removing the build file: ' + BUILD_FILE_PATH);
    console.log('');
    console.log(error);

    process.exit(1);
  }

  console.log('');
  console.log('SUCCESSFULLY BUILT AND DEPLOYED TO APPHUB!')
  console.log('');

  var buildURL = BUILD_URL_BASE + APP_HUB_ID;
  console.log('You can see your build here: ' + buildURL);

  console.log('');

  if (program.openBuildUrl) {
    console.log('Opening AppHub Builds...');

    open(buildURL);
  }

  process.exit(0);

  // console.log('Deployed Successfully to AppHub.');
  // console.log('You can view the build at ' + buildURL);

  //       process.exit(0);
  // request
  //   .put('https://api.apphub.io/v1/upload')
  //   .set('X-AppHub-Application-ID', APP_HUB_ID)
  //   .set('X-AppHub-Application-Secret', APP_HUB_SECRET)
  //   .set('Content-Type', 'application/zip')
  //   .attach('', BUILD_FILE_NAME)
  //   .end(function (err, res) {
  //     console.log( res.req );

  //     if (!err && res.ok) {
  //       buildURL = 'https://dashboard.apphub.io/projects/' + APP_HUB_ID;

  //       console.log('Deployed Successfully to AppHub.');
  //       console.log('You can view the build at ' + buildURL);

  //       process.exit(0);
  //     }

  //     var errorMessage;
  //     if (res && res.status === 401) {
  //       errorMessage = "Authentication failed! Bad username/password?";
  //     } else if (err) {
  //       errorMessage = err;
  //     } else {
  //       errorMessage = res.text;
  //     }
  //     console.error(errorMessage);
  //     process.exit(1);
  //   });
};
