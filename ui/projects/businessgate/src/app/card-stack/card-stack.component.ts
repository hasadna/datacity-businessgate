import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { ScriptRunnerImpl } from 'hatool';

import * as mapboxgl from 'mapbox-gl';
import { FeatureCollection } from 'geojson';
import { MapService } from '../map.service';
import { from, fromEvent, Observable, ReplaySubject, Subject, Subscription, timer } from 'rxjs';
import { WidgetsService } from '../widgets.service';
import { debounceTime, delay, filter, first, map, switchMap, tap } from 'rxjs/operators';
import { StateService } from '../state.service';
import { ObservableQueue } from '../observable-queue';


export enum CardStackState {
  Created = 'created',
  Initial = 'initial',
  Opening = 'opening',
  Open = 'open',
  Closing = 'closing',
  Closed = 'closed',
};

export enum StackExpansionState {
  Collapsed = 'collapsed',
  Expanded = 'expanded',
  Expanding = 'expanding',
  Collapsing = 'collapsing',
};

@Component({
  selector: 'app-card-stack',
  templateUrl: './card-stack.component.html',
  styleUrls: ['./card-stack.component.less']
})
export class CardStackComponent implements OnInit, OnChanges, AfterViewInit {
  
  // Inputs
  @Input() stack;
  @Input() params;
  @Input() goodbye = false;
  @Input() small = true;

  // Outputs
  @Output() activeCard = new EventEmitter<{index: number, card: any}>();
  @Output() stackState = new EventEmitter<string>();
  @Output() returned = new EventEmitter<any>();

  // DOM
  @ViewChild('stackEl', {static: false}) stackEl: ElementRef;

  // Measurements
  MAX_CARD_WIDTH = 348;
  PADDING = 60;

  width = 0;
  fullWidth = 0;
  scrollPadding = 0;
  positionTransform = 'translateY(0)';

  // Map stuff
  PREFIX = 'red_';
  POLYGON_LAYERS = [
    'polygons_choropleth_pattern',
    'polygons_choropleth_line_base',
    'polygons_choropleth_lines',
    'polygons_choropleth_selected',
  ];
  LABEL_LAYERS = [
    'marker_selected',
    'markers_other'    
  ];
  ISO_LAYERS = [
    'iso-fill',
    'iso-line',
    'iso-text',
  ];
  mapPadding = {};
  map: mapboxgl.Map;
  fullBounds: mapboxgl.LngLatBounds;
  mapFitParams = new Subject<any[]>();

  // Horizontal scroll
  currentIndex = -1;
  scrollSub: Subscription = null;

  // Expand/Collapse
  expandState: StackExpansionState = StackExpansionState.Collapsed;
  expandQueue = new ObservableQueue<void>('EXPAND Q');

  // State
  innerState: CardStackState = CardStackState.Created;
  openQueue = new ObservableQueue<void>('OPEN Q');

  runner: ScriptRunnerImpl;
  record: any;
  cards = [];
  init = new ReplaySubject<boolean>();
  openState = new Subject<boolean>();
  // openStateHandling: Subject<void> = null;
  mapCloseRequestedSub: Subscription = null;
  _stack = null;

  constructor(public el: ElementRef, 
              private mapSvc: MapService,
              private widgets: WidgetsService,
              private state: StateService) {
    this.mapFitParams.pipe(
      debounceTime(100),
    ).subscribe((x) => {
      this._fitMap(x[0], x[1], x[2]);
    });
    this.init.pipe(
      filter((x) => !!x),
      delay(0),
      tap(() => {
        const el = this.el.nativeElement as HTMLDivElement;
        this.fullWidth = el.offsetWidth;
        this.width = this.fullWidth - this.PADDING;
        this.scrollPadding = this.PADDING;
        if (this.width > this.MAX_CARD_WIDTH) {
          this.width = this.MAX_CARD_WIDTH;
          this.scrollPadding = this.fullWidth - this.width;
        }
        this.scrollPadding = this.scrollPadding / 2;
      }),
      delay(1000),
      tap(() => {
        this.innerState = CardStackState.Initial;
        this.expand();
      }),
    ).subscribe((v) => {});
    this.initStateListener();
  }

  // Ng Lifecycle
  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.init.next(!!this.stack && !!this.el.nativeElement);
  }

  ngOnChanges(): void {
    // let obs: Observable<any> = from([true]);
    // if (this.innerState === CardStackState.Open) {
    //   obs = this.collapse();
    // }
    if (!this._stack) {
      this.updateStack();
      this.init.next(!!this.stack && !!this.el.nativeElement);
    }
  }

  updateStack() {
    // console.log('REPLACING STACK', this._stack?.name, '->', this.stack?.name);
    this.runner = this.params.__runner;
    this.record = this.runner.record;
    if (this.stack !== this._stack) {
      this._stack = this.stack;
      this.cards = this.processCards();
    }
  }

  // State Management
  initStateListener() {
    this.openState.pipe(delay(0)).subscribe((state) => {
      if (state) {
        // console.log('HANDLING REQUEST FOR OPENING STACK', this.stackName);
        this.openQueue.add(this.openStack());
      } else {
        // console.log('HANDLING REQUEST FOR CLOSING STACK', this.stackName);
        this.openQueue.add(this.closeStack());
      }
    });
  }

  get open() {
    return this.innerState === CardStackState.Opening || this.innerState === CardStackState.Open;
  }

  startScrollListening() {
    const el = this.stackEl.nativeElement as HTMLDivElement;
    this.fullWidth = el.offsetWidth;
    this.scrollSub = fromEvent(el, 'scroll').subscribe((event) => {
      let ticking = false;
      let scrollPosition = (event.target as HTMLDivElement).scrollLeft;
      if (!ticking) {
        requestAnimationFrame(() => {
          scrollPosition = -scrollPosition;
          let fromCard = Math.floor(scrollPosition / this.width);
          let interpolate = (scrollPosition % this.width) / this.width;
          if (interpolate === 0 && fromCard !== 0) {
            interpolate = 1;
            fromCard -= 1;
          }
          this.fitMap(fromCard, fromCard + 1, interpolate);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  expand() {
    const el = this.stackEl.nativeElement as HTMLDivElement;
    const obs = from([true]).pipe(
      tap(() => {
        // console.log(this.stackName, 'EXPANDING');
        this.expandState = StackExpansionState.Expanding;
        if (this.scrollSub) {
          this.scrollSub.unsubscribe();
          this.scrollSub = null;  
        }
      }),
      delay(600), //TODO wait for animation to finish
      tap(() => {
        el.scroll({top: 0, left: 0, behavior: 'auto'});
      }),
      delay(0), // Wait for layouting
      tap(() => {
        this.calcPositionTransform(); // Position vertically
        this.startScrollListening();
      }),
      delay(250), //TODO wait for end of scrolling
      map(() => {
        const el = this.stackEl.nativeElement as HTMLDivElement;
        if (this.innerState === CardStackState.Opening) {
          el.scroll(-this.width, 0); // Scroll to the first card
        }
        this.expandState = StackExpansionState.Expanded;
      }),
      delay(1000), //wait for end of scrolling
      tap(() => {
        // console.log(this.stackName, 'EXPANDED');
      })
    );
    const done = new ReplaySubject<void>();
    const checker = from([true]).pipe(
      switchMap(() => {
        // console.log(this.stackName, 'CHECKING IF EXPANDED', this.expandState);
        if (this.expandState === StackExpansionState.Expanded || this.expandState === StackExpansionState.Expanding) {
          return from([void 0]).pipe(
            tap(() => {
              if (this.innerState === CardStackState.Opening || this.innerState === CardStackState.Open) {
                const el = this.stackEl.nativeElement as HTMLDivElement;
                el.scroll(-this.width, 0); // Scroll to the first card
              }
            }),
            delay(1000),
            tap(() => {
              if (this.innerState === CardStackState.Opening || this.innerState === CardStackState.Open) {
                const el = this.stackEl.nativeElement as HTMLDivElement;
                el.scroll(-this.width, 0); // Scroll to the first card
              }
            })
          );
        } else {
          return obs;
        }
      }),
      tap(() => {
        done.next();
      })
    );
    // console.log('REQUESTING EXPAND', this.stackName);
    this.expandQueue.add(checker);
    return done;
  }

  collapse() {
    const r = Math.random();
    const obs = from([true]).pipe(
      tap(() => {
        // console.log(this.stackName, 'COLLAPSING', r);
        this.expandState = StackExpansionState.Collapsing;
      }),
      delay(500), // Wait for other scrolling to end so that this one works
      tap(() => {
        const el = this.stackEl.nativeElement as HTMLDivElement;
        console.log('SCROLLING TO 0');
        el.scroll(0, 0);
      }),
      // delay(600), //TODO Wait for animation to finish
      delay(1000), //wait for end of scrolling
      map(() => {
        console.log('SCROLLED TO 0');
        this.expandState = StackExpansionState.Collapsed;
        // console.log(this.stackName, 'COLLAPSED', r);
      })
    );
    const done = new ReplaySubject<void>();  
    const checker = from([r]).pipe(
      switchMap(() => {
        // console.log(this.stackName, 'CHECKING IF COLLAPSED', r, this.expandState);
        if (this.expandState === StackExpansionState.Collapsed || this.expandState === StackExpansionState.Collapsing) {
          return from([void 0]);
        } else {
          return obs;
        }
      }),
      tap(() => {
        done.next();
      })
    );
    // console.log('REQUESTING COLLAPSE', r, this.stackName);
    this.expandQueue.add(checker);
    return done;
  }

  openStack() {
    const obs = from([true]).pipe(
      tap(() => {
        // console.log(this.stackName, 'OPENING');
        this.innerState = CardStackState.Opening;
        this.widgets.openStack = this;
        this.updateStack();    
      }),
      switchMap(() => {
        this.state.pushState('stack', this.stackName);
        this.stackState.emit('opening');
        this.fitMap(0, 1, 0);
        // console.log('WAITING FOR EXPAND');
        return this.expand();
      }),
      tap(() => {
        // console.log('EXPANDED');
        this.calcPositionTransform(); // Position vertically
        this.innerState = CardStackState.Open;
      }),
      switchMap(() => {
         if (this._stack.map) {
          return this.showMap();
        } else {
          return from([true]);
        }    
      }),
      delay(250), /// Wait for repositioning to avoid closing by scroll detection
      map(() => {
        this.stackState.next('open'); // Mark as open
        // console.log(this.stackName, 'STACK IS OPEN');
      }),
    );
    return from([true]).pipe(
      switchMap(() => {
        // console.log('CHECKING IF STACK IS OPEN', this.stackName, this.innerState);
        if (this.innerState === CardStackState.Open || this.innerState === CardStackState.Opening) {
          return from([void 0]);
        } else {
          return obs;
        }
      })
    );
  }

  closeStack() {
    const obs = from([true]).pipe(
      tap(() => {
        // console.log(this.stackName, 'CLOSING');
        this.innerState = CardStackState.Closing;
        this.state.popState('stack', this.stackName);
        this.map = null;
        this.stackState.next('closing');
        this.widgets.openStack = null;
      }),
      switchMap(() => {
        // console.log(this.stackName, 'CLOSING MAP');
        return this.closeMap();
      }),
      switchMap(() => {
        return this.collapse();
      }),
      tap(() => {
        // console.log(this.stackName, 'CLOSING DONE');
        this.innerState = CardStackState.Closed;
        this.calcPositionTransform();  
      }),
      delay(0),
      map(() => {
        this.stackState.next('closed');
      })
    );
    return from([true]).pipe(
      switchMap(() => {
        // console.log('CHECKING IF STACK IS CLOSED', this.stackName, this.innerState);
        if (this.innerState !== CardStackState.Open && this.innerState !== CardStackState.Opening && this.innerState !== CardStackState.Initial) {
          return from([void 0]);
        } else {
          return obs;
        }
      }),
    );
  }

  showMap() {
    const key = Math.random() + 1;
    return from([true]).pipe(
      switchMap(() => {
        this.processGeometries();
        if (this._stack.scheme === 'green') {
          this.PREFIX = 'green_';
        }
        this.cards.forEach((card) => {
          card.bounds = card.bounds || this.fullBounds;
        });
        this.widgets.mapActive.next(key);
        this.mapCloseRequestedSub = this.widgets.mapCloseRequested.pipe(delay(0), first()).subscribe(() => {
          console.log('MAP CLOSE REQUESTED');
          this.openState.next(false);
          this.mapCloseRequestedSub = null;
        });
        return this.widgets.mapLoaded.pipe(filter((x) => !!x), first());
      }),
      map((map) => {
        if (map['__key'] !== key) {
          return false;
        }
        this.map = map;
        map.addSource(
          'data',  {type: 'geojson', data: this._stack.geometry}
        );
        map.addSource(
          'pointData',  {type: 'geojson', data: this._stack.pointGeometry}
        );
        map.addSource(
          'isochronesData',  {type: 'geojson', data: this._stack.isochronesGeometry}
        );
        const style = map.getStyle();
        for (const layer_id of this.POLYGON_LAYERS) {
          const layer = style.layers.filter((l) => l.id == this.PREFIX + layer_id)[0] as mapboxgl.FillLayer;
          const newLayer: any = {
            id: layer_id, 
            type: layer.type,
            source: 'data',
            layout: Object.assign(layer.layout || {}, {visibility: 'visible'}),
            paint: layer.paint,
          };
          if (layer.filter) {
            newLayer.filter = layer.filter;
          }
          // console.log('SHOWING LAYER', layer_id, newLayer, 'WITH GEOM', this._stack.geometry);
          map.addLayer(newLayer, this.PREFIX + layer_id);
        }
        for (const layer_id of this.ISO_LAYERS) {
          const layer = style.layers.filter((l) => l.id === layer_id)[0] as mapboxgl.FillLayer;
          map.addLayer({
            id: '_' + layer_id, 
            type: layer.type,
            source: 'isochronesData',
            layout: Object.assign(layer.layout || {}, {visibility: 'visible'}),
            paint: layer.paint,          
          } as mapboxgl.FillLayer, layer_id);
        }
        for (const layer_id of this.LABEL_LAYERS) {
          const layer = style.layers.filter((l) => l.id === layer_id)[0] as mapboxgl.SymbolLayer;
          let layout = Object.assign(layer.layout || {}, {visibility: 'visible'});
          if (layout['icon-image']) {
            // layout['icon-image'] = 'map-marker';
            // layout['icon-text-fit'] = 'both';
            // layout['text-anchor'] = 'center';
            // layout['text-offset'] = [0, -18];
            layout = {
              "icon-text-fit": "both",
              "icon-offset": [
                0,
                2
              ],
              "icon-anchor": "bottom",
              "icon-image": "map-marker",
              "text-size": 20,
              "text-line-height": 0.9,
              "text-font": [
                "Narkiss Block Condensed TRIAL Regular",
                "Arial Unicode MS Regular"
              ],
              "icon-allow-overlap": true,
              "text-offset": [
                0,
                0
              ],
              "text-anchor": "center",
              "text-field": [
                "to-string",
                [
                  "get",
                  "title"
                ]
              ],
              "visibility": "visible"
            }
          }
          map.addLayer({
            id: '_' + layer_id, 
            type: layer.type,
            source: 'pointData',
            layout: layout,
            paint: layer.paint,          
          } as mapboxgl.SymbolLayer, layer_id);
        }
        if (this.record.location && this.record.location.center) {
          map.addSource(
            'centerData',  {type: 'geojson', data: this.record.location.center}
          );
          const layer_id = 'center_symbol';
          const layer = style.layers.filter((l) => l.id === layer_id)[0] as mapboxgl.FillLayer;
          map.addLayer({
            id: '_' + layer_id, 
            type: layer.type,
            source: 'centerData',
            layout: Object.assign(layer.layout || {}, {visibility: 'visible'}),
          } as mapboxgl.FillLayer, layer_id);
        }
        const el = this.el.nativeElement as HTMLDivElement;
        this.mapPadding = {
          top: 10, left: 10, right: 10, bottom: el.getBoundingClientRect().height 
        };
        this.fitMap(1, 2, 0);
        this.stackState.next('map-opened');
        return true;
      })
    );
  }

  closeMap() {
    this.widgets.mapActive.next(0);
    const ret = this.widgets.mapLoaded.pipe(
      filter((x) => x === null),
      first(),
      tap(() => {
        this.calcPositionTransform();
        this.stackState.next('map-closed');
        console.log('CLOSED MAP', this.stackName);
      })
    );
    console.log('CLOSE MAP', this.widgets.mapLoaded, 'ret=', ret);
    return ret;
  }

  returnValue(value) {
    this.returned.next(value);
  }

  // Utilities
  layout(card) {
    return card.layout || this._stack.layout || 'simple';
  }

  current() {
    if (this._stack.currentField && this.record && this.record.location) {
      return this.record.location[this._stack.currentField];
    }
  }

  get stackName() {
    return this._stack ? this._stack.name : '<noname>';
  }

  get stateName() {
    return this._stack?.state_name || this.stackName;
  }

  // Position calculation
  transform(i) {
    if (this.expandState === StackExpansionState.Expanded || this.expandState === StackExpansionState.Expanding) {
      return 'translateX(0px) translateY(0px) rotate(0deg)';
    } else {
      const rotation = i > 0 ? (i*777 % 10) - 5 : 0;
      const y = (i*778) % 10;
      return 'translateX(' + i * this.width + 'px) translateY(' + y + 'px) rotate(' + rotation + 'deg)';
    }
  }

  calcPositionTransform() {
    if (this.open && this._stack) {
      const el = this.el.nativeElement as HTMLDivElement;
      const bbox = el.getBoundingClientRect();
      const bottom = bbox.top + bbox.height;
      const height = window.innerHeight;
      let target = 0;
      if (this._stack.map) {
        target = height;
      } else {
        target = height/2 + bbox.height/2;
      }
      this.positionTransform = 'translateY(' + (target - bottom) + 'px)';
      return true;
  } else {
      this.positionTransform = 'translateY(0px)';
      return false;
    }
  }
  
  // Data Processing
  processCards() {
    const ret = [];
    const business_name = this.record.סוג_עסק || '';
    for (const card of this._stack.cards) {
      card.selectButtonText = card.selectButtonText || this._stack.selectButtonText;
      if (card.test) {
        if (!this.runner.get(this.record, card.test)) {
          continue;
        }
      }
      if (card.business_kinds) {
        let found = false;
        for (const bk of card.business_kinds) {
          if (bk === 'כל העסקים') {
            found = true;
          }
          if (this.record._business_record) {
            if (bk === business_name) {
              found = true;
            }
            if (this.record._business_record.demand_category) {
              for (const dm of this.record._business_record.demand_category) {
                if (bk === dm[0]) {
                  found = true;
                }
              }  
            }
            const licensable = this.record._business_record.license_item && this.record._business_record.license_item.length > 0;
            if (bk === 'טעוני רישוי' && licensable) {
              found = true;
            }
            if (bk === 'לא טעוני רישוי' && !licensable) {
              found = true;
            }
            if (found) {
              break;
            }
          }  
        }
        if (!found) {
          continue;
        }
      }
      if (card.commercial_areas) {
        let found = false;
        if (this.record.location) {
          const loc = this.record.location;
          for (const ca of card.commercial_areas) {
            if (ca === loc.commercial_area) {
              found = true;
            }
          }
        }
        if (!found) {
          continue;
        }
      }
      ret.push(card)
    }
    return ret;
  }

  // GEO Processing
  calculateGeometryBounds(geometry) {
    const ret = new mapboxgl.LngLatBounds();
    if (geometry.type === 'FeatureCollection') {
      for (const feature of geometry.features) {
        ret.extend(this.calculateGeometryBounds(feature));
      }
    } else if (geometry.type === 'Feature') {
      return this.calculateGeometryBounds(geometry.geometry);
    } else if (geometry.type === 'Polygon') {
      for (const coordinates of geometry.coordinates) {
        for (const latlng of coordinates) {
          ret.extend(latlng);
        }
      }
    } else {
      ret.extend(geometry.coordinates);      
    }
    return ret;
  }

  processGeometries() {
    this.fullBounds = new mapboxgl.LngLatBounds();
    this._stack.bounds = [this.fullBounds];
    const geometry: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };
    const isochronesGeometry: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };
    const pointGeometry: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };
    
    this.cards.forEach((card) => {
      if (card.geometry) {
        card.geometry.properties.title = card.geometry.properties.title || card.title;
        card.geometry.properties.x = card.geometry.properties.x || 2;
        card.geometry.properties.selected = card.geometry.properties.selected || false;
        const cardBounds = this.calculateGeometryBounds(card.geometry);
        this.fullBounds.extend(cardBounds);
        this._stack.bounds.push(cardBounds);
        geometry.features.push(card.geometry);

        if (!card.pointGeometry) {
          card.pointGeometry = this.mapSvc.calculatePoint(card.geometry);
        }
        card.pointGeometry.properties = card.geometry.properties;
        pointGeometry.features.push(card.pointGeometry);
      } else {
        this._stack.bounds.push(this.fullBounds);
      }
    });

    if (!this._stack.geometry) {
      this._stack.geometry = geometry;
    } else {
      this.fullBounds.extend(this.calculateGeometryBounds(this._stack.geometry));
      (this._stack.geometry.features || []).forEach((geometry) => {
        geometry.properties.x = geometry.properties.x || 2;
        if (this._stack.currentField) {
          geometry.properties.selected = this.record.location && (geometry.properties.title === this.record.location[this._stack.currentField]);
        } else {
          geometry.properties.selected = geometry.properties.selected || false;
        }
      });
    }

    if (!this._stack.isochronesGeometry) {
      this._stack.isochronesGeometry = isochronesGeometry;
    } else {
      this.fullBounds.extend(this.calculateGeometryBounds(this._stack.isochronesGeometry));
    }

    if (!this._stack.pointGeometry) {
      this._stack.pointGeometry = pointGeometry;
    }
    this._stack.bounds.push(this.fullBounds);
  }

  fitMap(boundsIdx1, boundsIdx2, t) {
    this.currentIndex = Math.round(boundsIdx1 + t) - 1;
    if (this._stack.map) {
      this.mapFitParams.next([boundsIdx1, boundsIdx2, t]);
    }
  }

  _fitMap(boundsIdx1, boundsIdx2, t) {
    if (!this.fullBounds) {
      return;
    }
    if (this.map) {
      const index = Math.round(boundsIdx1 + t) - 1;
      const card = this.cards[index];
      this.activeCard.emit({index, card});
      if (card && card.geometry) {
        (this.map.getSource('data') as mapboxgl.GeoJSONSource).setData(card.geometry);
      } else {
        if (card && card.scores) {
          const scores = {};
          for (const score of card.scores) {
            scores[score.title] = score.geometry_score;
          }
          for (const feature of this._stack.geometry.features) {
            if (feature.properties) {
              feature.properties.x = scores[feature.properties.title];
            }
          }
        }
        (this.map.getSource('data') as mapboxgl.GeoJSONSource).setData(this._stack.geometry);
      }
      let pointGeometry: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };
      if (card && card.pointGeometry) {
        pointGeometry = card.pointGeometry;
      } else if (this._stack.pointGeometry) {
        pointGeometry = this._stack.pointGeometry;
      } 
      (this.map.getSource('pointData') as mapboxgl.GeoJSONSource).setData(pointGeometry);
    }
    const bounds1: mapboxgl.LngLatBounds = this._stack.bounds[boundsIdx1];
    const bounds2: mapboxgl.LngLatBounds = this._stack.bounds[boundsIdx2];
    let bounds = bounds2;
    if (bounds1 !== bounds2) {
      bounds = new mapboxgl.LngLatBounds(
        new mapboxgl.LngLat(
          (1 - t) * bounds1.getSouthWest().lng + t * bounds2.getSouthWest().lng,
          (1 - t) * bounds1.getSouthWest().lat + t * bounds2.getSouthWest().lat,
        ), //sw
        new mapboxgl.LngLat(
          (1 - t) * bounds1.getNorthEast().lng + t * bounds2.getNorthEast().lng,
          (1 - t) * bounds1.getNorthEast().lat + t * bounds2.getNorthEast().lat,
        ), //ne
      );
    }
    this.widgets.mapBounds.next({bounds: bounds, padding: this.mapPadding});
  }

  scroll(event: MouseEvent, ahead: boolean) {
    const el = (event.target as HTMLElement).parentElement.querySelector('.cards');
    if (ahead) {
      el.scrollBy({left: -this.width, behavior: 'smooth'});
    } else {
      el.scrollBy({left: this.width, behavior: 'smooth'});
    }
  }

}
