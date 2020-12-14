import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { ScriptRunnerImpl } from 'hatool';

import * as mapboxgl from 'mapbox-gl';
import { FeatureCollection } from 'geojson';
import { MapService } from '../map.service';
import { from, fromEvent, ReplaySubject, Subject, Subscription } from 'rxjs';
import { WidgetsService } from '../widgets.service';
import { debounceTime, delay, filter, first, map, switchMap, tap } from 'rxjs/operators';


@Component({
  selector: 'app-card-stack',
  templateUrl: './card-stack.component.html',
  styleUrls: ['./card-stack.component.less']
})
export class CardStackComponent implements OnInit, OnChanges {
  
  // Inputs
  @Input() stack;
  @Input() params;
  @Input() goodbye = false;

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

  // State
  runner: ScriptRunnerImpl;
  record: any;
  currentIndex = -1;
  open = false;
  opened = false;
  cards = [];
  init = new ReplaySubject<boolean>();
  openState = new Subject<boolean>();
  openStateHandling: Subject<void> = null;
  scrollSub: Subscription = null;
  mapCloseRequestedSub: Subscription = null;
  _stack = null;

  constructor(public el: ElementRef, 
              private mapSvc: MapService,
              private widgets: WidgetsService) {
    this.mapFitParams.pipe(
      debounceTime(100),
    ).subscribe((x) => {
      this._fitMap(x[0], x[1], x[2]);
    });
    this.init.pipe(
      filter((x) => !!x),
      delay(1),
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
      })
    ).subscribe((v) => {});
    this.initStateListener();
  }

  // Ng Lifecycle
  ngOnInit(): void {
  }

  ngOnChanges(): void {
    this.runner = this.params.__runner;
    this.record = this.runner.record;
    if (this.stack !== this._stack) {
      this._stack = this.stack;
      this.cards = this.processCards();
    }
    this.init.next(!!this.stack);
  }

  // State Management
  initStateListener() {
    this.openState.pipe(
      switchMap((state) => {
        console.log(this.stackName, 'OPEN STATE', state);
        if (this.openStateHandling) {
          return this.openStateHandling.pipe(map(() => state));
        } else {
          return from([state]);
        }
      }),
      switchMap((state) => {
        this.openStateHandling = new Subject<void>();
        if (this.open) {
          return this.closeStack().pipe(
            map(() => state)
          );
        } else {
          return from([state]);
        }
      }),
      delay(100),
      switchMap((state) => {
        if (state) {
          console.log(this.stackName, 'OPENING STACK', state);
          return this.openStack();
        } else {
          return from([state]);
        }
      })
    ).subscribe((state) => {
      const obs = this.openStateHandling;
      this.openStateHandling = null;
      obs.next();
    });
  }

  openStack() {
    return from([true]).pipe(
      delay(0),
      tap(() => {
        this.open = true;
        this.stackState.emit('opening');
        this.fitMap(0, 1, 0);
      }),
      delay(600),
      switchMap(() => {
        const el = this.stackEl.nativeElement as HTMLDivElement;
        this.fullWidth = el.offsetWidth;
        this.opened = true;
        this.scrollSub = fromEvent(el, 'scroll').subscribe((event) => {
          let ticking = false;
          let scrollPosition = (event.target as HTMLDivElement).scrollLeft;
          if (!ticking) {
            requestAnimationFrame(() => {
              // if (scrollPosition !== 0) {
              //   scrollPosition = -scrollPosition - 20 + (this.fullWidth - this.width) / 2;
              // }
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
        if (this.stack.map) {
          return this.showMap();
        } else {
          return from([true]);
        }
      }),
      delay(250),
      tap(() => {
        this.calcPositionTransform();
        const el = this.stackEl.nativeElement as HTMLDivElement;
        el.scroll(-this.width, 0);
        this.stackState.next('open');
        console.log(this.stackName, 'STACK IS OPEN');
      })
    );
  }

  closeStack() {
    return from([true]).pipe(
      delay(0),
      tap(() => {
        console.log(this.stackName, 'CLOSING');
        this.open = false;
        this.map = null;
        this.stackState.next('closing');
        if (this.scrollSub) {
          this.scrollSub.unsubscribe();
          this.scrollSub = null;  
        }
        const el = this.stackEl.nativeElement as HTMLDivElement;
        el.scroll(0, 0);
      }),
      switchMap(() => {
        console.log(this.stackName, 'CLOSING MAP');
        return this.closeMap();
      }),
      delay(600),
      tap(() => {
        console.log(this.stackName, 'CLOSING DONE');
        this.opened = false;
        this.calcPositionTransform();  
      }),
      delay(1),
      tap(() => {
        this.stackState.next('closed');
      })
    );
  }

  showMap() {
    const key = Math.random() + 1;
    return from([true]).pipe(
      switchMap(() => {
        this.processGeometries();
        if (this.stack.scheme === 'green') {
          this.PREFIX = 'green_';
        }
        this.cards.forEach((card) => {
          card.bounds = card.bounds || this.fullBounds;
        });
        this.widgets.mapActive.next(key);
        this.mapCloseRequestedSub = this.widgets.mapCloseRequested.pipe(first()).subscribe(() => {
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
          'data',  {type: 'geojson', data: this.stack.geometry}
        );
        map.addSource(
          'pointData',  {type: 'geojson', data: this.stack.pointGeometry}
        );
        map.addSource(
          'isochronesData',  {type: 'geojson', data: this.stack.isochronesGeometry}
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
          map.addLayer(newLayer);
        }
        for (const layer_id of this.ISO_LAYERS) {
          const layer = style.layers.filter((l) => l.id === layer_id)[0] as mapboxgl.FillLayer;
          map.addLayer({
            id: '_' + layer_id, 
            type: layer.type,
            source: 'isochronesData',
            layout: Object.assign(layer.layout || {}, {visibility: 'visible'}),
            paint: layer.paint,          
          } as mapboxgl.FillLayer);
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
          } as mapboxgl.SymbolLayer);
        }
        if (this.record.location && this.record.location.center) {
          map.addSource(
            'centerData',  {type: 'geojson', data: this.record.location.center}
          );
          const layer = style.layers.filter((l) => l.id === 'center_symbol')[0] as mapboxgl.FillLayer;
          map.addLayer({
            id: '_center_symbol', 
            type: layer.type,
            source: 'centerData',
            layout: Object.assign(layer.layout || {}, {visibility: 'visible'}),
          } as mapboxgl.FillLayer);
        }
        const el = this.el.nativeElement as HTMLDivElement;
        this.mapPadding = {
          top: 10, left: 10, right: 10, bottom: window.innerHeight - el.getBoundingClientRect().height 
        };
        this.fitMap(1, 2, 0);
        this.stackState.next('map-opened');
        return true;
      })
    );
  }

  closeMap() {
    this.widgets.mapActive.next(0);
    return this.widgets.mapLoaded.pipe(
      filter((x) => x === null),
      first(),
      tap(() => {
        this.calcPositionTransform();
        this.stackState.next('map-closed');
      })
    );
  }

  returnValue(value) {
    this.returned.next(value);
  }

  // Utilities
  layout(card) {
    return card.layout || this.stack.layout || 'simple';
  }

  current() {
    if (this.stack.currentField && this.record && this.record.location) {
      return this.record.location[this.stack.currentField];
    }
  }

  get stackName() {
    return this.stack ? this.stack.name : '<noname>';
  }

  // Position calculation
  transform(i) {
    if (this.open) {
      return 'translateX(0px) translateY(0px) rotate(0deg)';
    } else {
      const rotation = i > 0 ? (i*777 % 10) - 5 : 0;
      const y = (i*778) % 10;
      return 'translateX(' + i * this.width + 'px) translateY(' + y + 'px) rotate(' + rotation + 'deg)';
    }
  }

  calcPositionTransform() {
    if (this.open && this.stack && this.stack.map) {
      const el = this.el.nativeElement as HTMLDivElement;
      const bbox = el.getBoundingClientRect();
      const bottom = bbox.top + bbox.height;
      const height = window.innerHeight;
      this.positionTransform = 'translateY(' + (height - bottom - 40) + 'px)';
      return true;
    } else {
      this.positionTransform = 'translateY(0px)';
      return false;
    }
  }
  
  // Data Processing
  processCards() {
    const ret = [];
    for (const card of this.stack.cards) {
      card.selectButtonText = card.selectButtonText || this.stack.selectButtonText;
      if (card.test) {
        if (!this.runner.get(this.record, card.test)) {
          continue;
        }
      }
      if (card.business_kinds) {
        let found = false;
        if (this.record._business_record) {
          for (const bk of card.business_kinds) {
            if (bk === this.record._business_record.business_kind_name) {
              found = true;
            }
            for (const dm of this.record._business_record.demand_category) {
              if (bk === dm[0]) {
                found = true;
              }
            }
            if (bk === 'טעוני רישוי' && this.record._num_licensing_agencies > 2) {
              found = true;
            }
            if (bk === 'לא טעוני רישוי' && this.record._num_licensing_agencies === 2) {
              found = true;
            }
            if (bk === 'כל העסקים') {
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
    this.stack.bounds = [this.fullBounds];
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
        this.stack.bounds.push(cardBounds);
        geometry.features.push(card.geometry);

        if (!card.pointGeometry) {
          card.pointGeometry = this.mapSvc.calculatePoint(card.geometry);
        }
        card.pointGeometry.properties = card.geometry.properties;
        pointGeometry.features.push(card.pointGeometry);
      } else {
        this.stack.bounds.push(this.fullBounds);
      }
    });

    if (!this.stack.geometry) {
      this.stack.geometry = geometry;
    } else {
      this.fullBounds.extend(this.calculateGeometryBounds(this.stack.geometry));
      (this.stack.geometry.features || []).forEach((geometry) => {
        geometry.properties.x = geometry.properties.x || 2;
        if (this.stack.currentField) {
          geometry.properties.selected = this.record.location && (geometry.properties.title === this.record.location[this.stack.currentField]);
        } else {
          geometry.properties.selected = geometry.properties.selected || false;
        }
      });
    }

    if (!this.stack.isochronesGeometry) {
      this.stack.isochronesGeometry = isochronesGeometry;
    } else {
      this.fullBounds.extend(this.calculateGeometryBounds(this.stack.isochronesGeometry));
    }

    if (!this.stack.pointGeometry) {
      this.stack.pointGeometry = pointGeometry;
    }
    this.stack.bounds.push(this.fullBounds);
  }

  fitMap(boundsIdx1, boundsIdx2, t) {
    this.currentIndex = Math.round(boundsIdx1 + t) - 1;
    if (this.stack.map) {
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
          for (const feature of this.stack.geometry.features) {
            if (feature.properties) {
              feature.properties.x = scores[feature.properties.title];
            }
          }
        }
        (this.map.getSource('data') as mapboxgl.GeoJSONSource).setData(this.stack.geometry);
      }
      let pointGeometry: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };
      if (card && card.pointGeometry) {
        pointGeometry = card.pointGeometry;
      } else if (this.stack.pointGeometry) {
        pointGeometry = this.stack.pointGeometry;
      } 
      (this.map.getSource('pointData') as mapboxgl.GeoJSONSource).setData(pointGeometry);
    }
    const bounds1: mapboxgl.LngLatBounds = this.stack.bounds[boundsIdx1];
    const bounds2: mapboxgl.LngLatBounds = this.stack.bounds[boundsIdx2];
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

  scroll(event: MouseEvent) {
    const el = (event.target as HTMLElement).parentElement.querySelector('.cards');
    el.scrollBy({left: -this.width, behavior: 'smooth'});
  }

}
