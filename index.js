#!/usr/bin/env node --harmony

var fs           = require('fs');
var program      = require('commander');
var readlineSync = require('readline-sync');

var appHubId;
var appHubSecret;
var buildFilename = 'AppHubBuild.zip';

program
  .version('1.0.0')
  .option('-c, --configure', 'Configure AppHub ID and Secret key')
  .parse(process.argv);

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

    appHubId     = appHubData.appHubId;
    appHubSecret = appHubData.appHubSecret;
  }

  build();
});



var setup = function() {

  appHubId     = readlineSync.question('AppHub App ID: ');
  appHubSecret = readlineSync.question('AppHub App Secret: ');

  console.log('');

  appHubCredentialsAsJSON = JSON.stringify( { "appHubId": appHubId, "appHubSecret": appHubSecret } );

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


var build = function() {
  console.log('Building...');

  buildResult = require('child_process').execSync( './node_modules/.bin/apphub build --verbose -o ' + buildFilename ).toString();

  console.log(buildResult);
  console.log('');
  console.log('BUILD SUCCESSFUL!');
  console.log('');

  deploy();
};

var deploy = function() {
  console.log('Deploying...');
  console.log('');

  // var curl = require('curlrequest');

  // var curlOptions = {
  //   method: 'PUT',
  //   headers: {
  //     'X-AppHub-Application-ID': appHubId,
  //     'X-AppHub-Application-Secret': appHubSecret,
  //     'Content-Type': 'application/zip'
  //   },
  //   url: 'https://api.apphub.io/v1/upload',
  //   'upload-file': buildFilename,
  // };

  // curl.request( curlOptions, function (err, stdout, meta) {
  //   console.log('%s %s', meta.cmd, meta.args.join(' '));
  // });
  // curlCommand =  'curl -X PUT';
  // curlCommand += ' -H "X-AppHub-Application-ID: ' + appHubId + '"';
  // curlCommand += ' -H "X-AppHub-Application-Secret: ' + appHubSecret + '"';
  // curlCommand += ' -H "Content-Type: application/zip"';
  // curlCommand += ' -L https://api.apphub.io/v1/upload';
  // // curlCommand += ' --include'; // Includes the HTTP header in the output.
  // curlCommand += ' --verbose';
  // curlCommand += ' --upload-file ./' + buildFilename;
  // curlCommand += ' https://api.apphub.io/v1/upload';


  try {
    getUrlForPutCommand =  'curl -X GET';
    getUrlForPutCommand += ' -H "X-AppHub-Application-ID: ' + appHubId + '"';
    getUrlForPutCommand += ' -H "X-AppHub-Application-Secret: ' + appHubSecret + '"';
    getUrlForPutCommand += ' -H "Content-Type: application/zip"';
    getUrlForPutCommand += ' -L https://api.apphub.io/v1/upload';
    getUrlForPutCommand += ' | python -c \'import json,sys;obj=json.load(sys.stdin);print obj["data"]["s3_url"]\'';

    urlForPut = require('child_process').execSync( getUrlForPutCommand ).toString().trim();

    console.log('urlForPut:');
    console.log(urlForPut);

    putCommand  = 'curl -X PUT';
    putCommand += ' -H "Content-Type: application/zip"';
    putCommand += ' -L "' + urlForPut + '"';
    putCommand += ' --upload-file ' + buildFilename;

    console.log('putCommand:');
    console.log(putCommand);

    putResponse = require('child_process').execSync( putCommand ).toString().trim();

    console.log( putResponse );
    console.log('');
    console.log("DEPLOY SUCCESSFUL!");

    process.exit(0);
  }
  catch(error) {
    console.log('');
    console.log('There was a problem uploading the build:');
    console.log(error);

    process.exit(1);
  }

  // buildURL = 'https://dashboard.apphub.io/projects/' + appHubId;

  // console.log('Deployed Successfully to AppHub.');
  // console.log('You can view the build at ' + buildURL);

  //       process.exit(0);
  // request
  //   .put('https://api.apphub.io/v1/upload')
  //   .set('X-AppHub-Application-ID', appHubId)
  //   .set('X-AppHub-Application-Secret', appHubSecret)
  //   .set('Content-Type', 'application/zip')
  //   .attach('', buildFilename)
  //   .end(function (err, res) {
  //     console.log( res.req );

  //     if (!err && res.ok) {
  //       buildURL = 'https://dashboard.apphub.io/projects/' + appHubId;

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
