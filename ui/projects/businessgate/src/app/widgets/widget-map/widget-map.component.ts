import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MapService } from '../../map.service';
import { WidgetsService } from '../../widgets.service';

import * as mapboxgl from 'mapbox-gl';
import { from, Observable, ReplaySubject } from 'rxjs';
import { first, distinctUntilChanged, delay, tap, filter } from 'rxjs/operators';

@Component({
  selector: 'app-widget-map',
  templateUrl: './widget-map.component.html',
  styleUrls: ['./widget-map.component.less']
})
export class WidgetMapComponent implements OnInit {

  @ViewChild('mapEl', {static: true}) mapEl: ElementRef;

  map: mapboxgl.Map;
  open = false;
  mapObs: ReplaySubject<mapboxgl.Map> = null;
  
  constructor(private mapService: MapService, private widgets: WidgetsService) {
    widgets.mapActive.subscribe((key) => {
      if (key > 0) {
        if (this.mapObs === null) {
          this.open = true;
          this.mapObs = new ReplaySubject<mapboxgl.Map>(1);
          setTimeout(() => {
            this.map = new mapboxgl.Map({
              container: this.mapEl.nativeElement,
              style: 'mapbox://styles/businessgate/ckja1jcb85fiz19p5iye1o6bb',
              minZoom: 3,
            });
            this.map['__key'] = key;
            this.map.on('style.load', () => {
              this.map.loadImage('/assets/img/map_marker.png', (error, image) => {
                if (error) {
                  throw error;
                }
                this.map.addImage('map-marker', image, {
                    stretchX: [
                      [24, 34],
                      [277, 287]
                    ],
                    stretchY: [[30, 80]],
                    content: [20, 25, 292, 91],
                    pixelRatio: 3
                  } as any);

                this.mapObs.next(this.map);
                this.widgets.mapLoaded.next(this.map);  
              });
            });
          }, 0);
        } else {
          this.widgets.mapLoaded.next(this.map);
        }
      }
      if (key === 0) {
        let obs: Observable<mapboxgl.Map> = this.mapObs;
        if (obs === null) {
          obs = from([null as mapboxgl.Map]);
        }
        obs.pipe(
          first(),
          tap((map) => {
            if (map) {
              console.log('DESTROYING MAP');
              map.remove();
              this.open = false;
              this.map = null;
              this.mapObs = null;    
            }
          }),
          delay(1)
        ).subscribe(() => {
          console.log('DESTROYED MAP', this.open);
          this.widgets.mapCloseRequested.next();
          this.widgets.mapLoaded.next(null);
        });
      }

    })
    widgets.mapBounds.pipe(
      distinctUntilChanged((a, b) => {
        return (
          (a === b) ||
          (!!a && !!b && a.bounds && b.bounds &&
            (a.padding === b.padding) &&
            ((a.bounds === b.bounds) ||
             (a.bounds.toString() === b.bounds.toString())) 
          )
        );
      }),
      filter((bounds) => !!bounds && !!bounds.bounds)
    ).subscribe((bounds) => {
      if (this.mapObs !== null) {
        this.mapObs.pipe(first()).subscribe((map) => {
          map.fitBounds(bounds.bounds, {padding: bounds.padding});
        });
      }
    });
  }

  ngOnInit(): void {
  }

  close() {
    this.widgets.mapCloseRequested.next();
  }
}
