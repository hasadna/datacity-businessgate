// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyBThYMMJrWg1BznrJEaQ49PSw1lG_XHApM',
    authDomain: 'businessgate-beersheva.firebaseapp.com',
    databaseURL: 'https://businessgate-beersheva.firebaseio.com',
    projectId: 'businessgate-beersheva',
    storageBucket: 'businessgate-beersheva.appspot.com',
    messagingSenderId: '292108806732',
    appId: '1:292108806732:web:1b2df43212b5e0202ae2e9',
    measurementId: 'G-MCEC1ECFK6'
  },
  base: '/',
  timeout: 10
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
