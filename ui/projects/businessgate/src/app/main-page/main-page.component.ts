import { AfterContentChecked, AfterContentInit, AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ScriptRunnerImpl as ScriptRunner, ContentManager } from 'hatool';
import { ConfigService } from '../config.service';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../api.service';
import { I18nService } from '../i18n.service';
import { ChatMsgImageComponent } from '../chat-msgs/chat-msg-image/chat-msg-image.component';
import { ChatMsgSelectFromListComponent } from '../chat-msgs/chat-msg-select-from-list/chat-msg-select-from-list.component';
import { ChatMsgCardStackComponent } from '../chat-msgs/chat-msg-card-stack/chat-msg-card-stack.component';
import { DataService } from '../data.service';
import { delay, first, map, switchMap, tap, timestamp, windowWhen } from 'rxjs/operators';
import booleanContains from '@turf/boolean-contains';
import distance from '@turf/distance';
import { forkJoin, fromEvent, of, Subscription } from 'rxjs';
import { MapService } from '../map.service';
import { BackendService } from '../backend.service';
import { ActivatedRoute } from '@angular/router';
import { WidgetsService } from '../widgets.service';
import { environment } from '../../environments/environment';
import { StacksService } from '../stacks.service';
import { StateService } from '../state.service';
import { MainScrollService } from '../main-scroll.service';
import { ChatMsgShareDialogComponent } from '../chat-msgs/chat-msg-share-dialog/chat-msg-share-dialog.component';
import { ChatMsgCopyLinkComponent } from '../chat-msgs/chat-msg-copy-link/chat-msg-copy-link.component';
import { ChatMsgHtmlSayComponent } from '../chat-msgs/html-say/chat-msg-html-say.component';

@Component({
  selector: 'app-main-page',
  templateUrl: './main-page.component.html',
  styleUrls: ['./main-page.component.less']
})
export class MainPageComponent implements OnInit, AfterViewInit, AfterContentChecked {
  content: ContentManager;
  runner: ScriptRunner;
  runnerSub: Subscription;
  config: any = {};
  record: any = {};
  @ViewChild('fixMe', {static: true}) fixMe: ElementRef;
  vScrollSub: Subscription;

  constructor(private cfg: ConfigService,
              private http: HttpClient,
              private api: ApiService,
              private data: DataService,
              private map: MapService,
              private activatedRoute: ActivatedRoute,
              private backend: BackendService,
              private widgets: WidgetsService,
              private stacksSvc: StacksService,
              private el: ElementRef,
              private mainScroll: MainScrollService,
              private state: StateService,
              public _: I18nService) {
    this.activatedRoute.params.subscribe((x) => {
      this.backend.handleItem(x.id);
    });
  }

  initChat() {
    this.cfg.config.pipe(
      first(),
      switchMap((config) => {
        this.config = config;
        return this.backend.record;
      }),
      first(),
      tap((record) => {
        this.record = record;        
      }),
      delay(0),
    ).subscribe(() => {
      this.content = new ContentManager();
      this.content.fixmeMessage = (this.fixMe.nativeElement as HTMLElement).innerHTML;
      this.runner = new ScriptRunner(this.http, this.content, this.config.locale);
      this.runner.timeout = environment.timeout;
      this.runner.registerCustomComponents([
        {
          keyword: 'img',
          cls: ChatMsgImageComponent
        },
        {
          keyword: 'select-from-list',
          cls: ChatMsgSelectFromListComponent,
          timeout: 0
        },
        {
          keyword: 'cards',
          cls: ChatMsgCardStackComponent
        },
        {
          keyword: 'share-dialog',
          cls: ChatMsgShareDialogComponent,
          timeout: 0
        },
        {
          keyword: 'copy-link',
          cls: ChatMsgCopyLinkComponent
        },
        {
          keyword: 'html-say',
          cls: ChatMsgHtmlSayComponent
        },
      ]);
      this.stacksSvc.runner = this.runner;
      this.content.sendButtonText = '';
      this.content.inputPlaceholder = this.config.inputPlaceholder;
      this.start();
    })
  }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.initChat();
    this.state.init(this.activatedRoute);
  }

  ngAfterContentChecked() {
    if (!this.vScrollSub) {
      const container = (this.el.nativeElement as HTMLElement).querySelector('htl-messages > .container');
      if (container) {
        this.vScrollSub = fromEvent(container, 'scroll').subscribe((event) => {
          this.mainScroll.scrollPosition.next((event.target as HTMLDivElement).scrollTop);
        });    
      }
    }
  }

  async check_for_opportunity() {
    // TODO
    return false;
  }

  async calculate_locations(record) {
    const location = record.location;
    if (location) {
      if (location.pointGeometry) {
        location.center = location.pointGeometry.geometry;
      } else {
        location.center = {
          type: 'Point',
          coordinates: [location.lon, location.lat]
        };
      }
      const obs = this.data.neighborhods.pipe(
        tap((neighborhoods) => {
              for (const neighborhood of neighborhoods.features) {
                if (booleanContains(neighborhood, location.center)) {
                  location.neighborhood = neighborhood.properties.title;
                  break;
                }
              }
            }),
        switchMap(() => this.data.stacks),
        tap((stacks) => {
          const commercial_areas = stacks['commercial-areas'].cards;
          for (const commercial_area of commercial_areas) {
            if (!commercial_area.geometry) {
              continue;
            }
            if (booleanContains(commercial_area.geometry, location.center)) {
              location.commercial_area = commercial_area.name;
              break;
            }
          }
        }),
        first(),
        switchMap(() => {
          if (!record.location.isochrones) {
            return forkJoin([
              this.map.isochrone(location.center.coordinates, 5),
              this.map.isochrone(location.center.coordinates, 10)
            ]);  
          } else {
            return of(record.location.isochrones);
          }
        }),
        tap((isochrones) => {
          record.location.isochrones = isochrones;
        }),
        tap(() => {
          console.log('_location_record', record.location);
        })
      );
      return obs.toPromise();
    }
  }

  check_needs_licensing(record) {
    const business_kind = record.סוג_עסק;
    return this.data.businesses.pipe(
      first(),
      map((businesses) => {
        const business_record = businesses.filter((b) => b.business_kind_name === business_kind)[0];
        console.log('_business_record', business_record);
        console.log('record', record);
        record._business_record = business_record;
        record._num_licensing_agencies = business_record.licensing_agency.length;
        record._licensing_agencies_stacks = business_record.licensing_agency.map((l) => l.value_id);
        return !!record._business_record.license_item && record._business_record.license_item.length > 0;
      })
    ).toPromise();
  }

  check_needs_signage(record) {
    return record._business_record.sign_count > 0;
  }

  calculate_arnona(record) {
    const business_record = record._business_record;
    const location = record.מיקום;
    const arnona_info: any = {};
    arnona_info.סיווג_נכס = business_record.tariff_zone;
    if (business_record.tariffs['']) {
      // Not zone aware
      arnona_info.תעריף = business_record.tariffs[''];
    } else {
      // Zone aware
      arnona_info.אזור = location.arnona_zones[arnona_info.סיווג_נכס] || 'error';
      arnona_info.תעריף = business_record.tariffs[arnona_info.אזור] || 0;
      arnona_info.לא_מצאנו = arnona_info['תעריף'] === 0
    }
    if (record.גודל_נכס && arnona_info['תעריף'] > 0) {
      const size = parseInt(
        record.גודל_נכס,
        10
      );
      if (size > 0) {
        arnona_info.עלות_כוללת = arnona_info.תעריף * size / 12;
        arnona_info.עלות_כוללת = arnona_info.עלות_כוללת.toFixed(0);
      }
    }
    arnona_info.תעריף = arnona_info.תעריף.toFixed(2);
    record.ארנונה = arnona_info;
  }

  async check_needs_demand(record) {

    function update_record(demand) {
      record['demand-stacks'] = [...new Set(demand.map((x) => 'demand.' + x[0].split(' ').join('_')))];
      for (const k of Object.keys(record)) {
        if (k.indexOf('demand__') === 0) {
          record[k] = false;
        }
      }
      for (const x of demand) {
        record[`demand__${x[0]}__${x[1]}`.split(' ').join('_')] = true;
      }
    }

    if (record._business_record) {
      const demand = record._business_record.demand_category;
      if (demand && demand.length > 0) {
        update_record(demand);
        return true;
      } 
    } 
    return this.data.demand_categories.pipe(
      first(),
      map((demand) => {
        update_record(demand);
      return false;
      })).toPromise();
  }

  prepare_geo_insights(record) {
    return this.data.stacks.pipe(
      first(),
      map((stacks) => {
        const features: any[] = [];
        features.push(...record.location.isochrones[0].features);
        features.push(...record.location.isochrones[1].features);
        stacks.institutions.isochronesGeometry = {
          type: 'FeatureCollection',
          features: features
        };
        let show_institutions = false;
        stacks.institutions.cards.forEach((card) => {
          if (card.pointGeometry) {
            for (const feature of card.pointGeometry.features) {
              if (distance(feature, record.location.center) < 0.5) {
                card.test = 'location';
                show_institutions = true;
                return;
              }
            }
            card.test = '__non_existent__';
          }
        });
        return show_institutions;
      })
    ).toPromise();      
  }

  async send_crm_email(record) {
    return this.backend.sendCRMEmail(record);
  }

  async select_commercial_area() {
    const responseTemplate = 'בחרתי {{location.title}}';
    if (this.runner.runFast) {
      this.content.queueFrom(this.runner.fillIn(responseTemplate));
      return;
    }
    this.widgets.stackActive.next({
      content: this.content,
      params: {
        __runner: this.runner,
        cards: {
          stack: 'commercial-areas',
          variable: 'location',
          variable2: 'מיקום',
          response: responseTemplate
        }
      }
    });
    return this.widgets.stackResult.pipe(
      first(),
      map((response) => {
        if (response) {
          this.content.queueFrom(response);
        }
        return response ? 'אשמח לשמוע' : null;
      })
    ).toPromise();
  }

  async stacks_button_visible() {
    this.stacksSvc.visible = true;
  }

  restart() {
    const state = this.runner.state;
    if (this.runnerSub) {
      this.runnerSub.unsubscribe();
      this.runnerSub = null;
    }
    this.stacksSvc.clear();
    this.initChat();
  }

  async new_chat() {
    window.location.href = '/';
  }

  async save() {
    this.content.reportUpdated(null);
    this.content.queueFunction(async () => {
      this.content.setQueueTimeout(environment.timeout);
      if (this.runner.runFast) {
          this.widgets.stacksPage.next('overview');
      }
      this.runner.runFast = false;
      this.stacksSvc.discovery = false;
      this.content.messages.forEach((m) => { if (m.params) { m.params.fixme = null; } });
    });
    return this.backend.doUpdate(this.record);
  }
  
  start() {
    this.runner.fixme = () => {
      this.restart();
    };
    // console.log('CONTENT', this.content);
    // this.content.debug = true;
    // this.runner.debug = true;
    this.record._state = this.record._state || {};
    this.runner.state = this.record._state;
    this.runnerSub = this.runner.run(
      this.config,
      0,
      {
        check_for_opportunity: async () => { return await this.check_for_opportunity(); },
        check_needs_licensing: async (record) => { return await this.check_needs_licensing(record); },
        check_needs_signage: async (record) => { return await this.check_needs_signage(record); },
        calculate_arnona: async (record) => { return await this.calculate_arnona(record); },
        check_needs_demand: async (record) => { return await this.check_needs_demand(record); },
        calculate_locations: async (record) => { return await this.calculate_locations(record); },
        prepare_geo_insights: async (record) => { return await this.prepare_geo_insights(record); },
        send_crm_email: async (record) => { return await this.send_crm_email(record); },
        select_commercial_area: async () => { return await this.select_commercial_area(); },
        stacks_button_visible: async () => { return await this.stacks_button_visible(); },
        new_chat: async () => { return await this.new_chat(); },
        save: async () => { return await this.save(); },
      },
      async (key, value, record) => {
        await this.backend.update(record);
      },
      this.record
    ).subscribe((res) => {
    });
  }
}