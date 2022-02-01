import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { VERSION } from './app/version';

import * as Sentry from "@sentry/angular";
import { Integrations } from "@sentry/tracing";

Sentry.init({
  dsn: "https://865cd6bfd82049d5a548c9b7cd9742b9@o367221.ingest.sentry.io/5571763",
  release: VERSION,
  autoSessionTracking: true,
  integrations: [
    new Integrations.BrowserTracing({
      // tracingOrigins: ['localhost:4200', "https://br7biz.org.il"],
      tracingOrigins: ["https://br7biz.org.il"],
      routingInstrumentation: Sentry.instrumentAngularRouting,
    }),
  ],

  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
});


if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
