import { Injectable } from '@angular/core';
import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';

import * as mapboxgl from 'mapbox-gl';
import { ContentManager } from 'hatool';
import { StateService } from './state.service';
import { CardStackComponent } from './card-stack/card-stack.component';


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

  public openStack: CardStackComponent | null = null;
  
  public moreInfoChat = new Subject<any>();
  public moreInfoChatDone = new Subject<any>();

  public sidePage = new Subject<string>();
  public stacksPage = new Subject<string>();

  public selecting = false;
  
  constructor(private state: StateService) {
    this.state.state.subscribe((state) => {
      for (const sidepage of [
        'main', 'about', 'contact', 'eula', 'privacy', 'no-menu'
      ]) {
        if (this.state.inState(state, 'menu', sidepage)) {
          this.sidePage.next(sidepage);
          break;
        }
        if (sidepage === 'no-menu') {
          this.sidePage.next(null);
        }
      }
      if (state.length === 0) {
        this.stackActive.next(null);
      }
    });
  }
}
