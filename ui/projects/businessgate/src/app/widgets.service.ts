import { Injectable } from '@angular/core';
import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';

import * as mapboxgl from 'mapbox-gl';
import { ContentManager } from 'hatool';


@Injectable({
  providedIn: 'root'
})
export class WidgetsService {

  public mapActive = new Subject<number>();
  public mapBounds = new Subject<{bounds: mapboxgl.LngLatBounds, padding: any}>();
  public mapLoaded = new Subject<mapboxgl.Map>();
  public mapCloseRequested = new Subject<void>();

  public stackActive = new Subject<{content: ContentManager, params: any}>();
  public stackResult = new Subject<any>();

  public moreInfoChat = new Subject<any>();
  public moreInfoChatDone = new Subject<any>();

  public sidePage = new Subject<string>();
  public stacksPage = new Subject<string>();
  
  constructor() { }
}
