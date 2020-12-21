import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ReplaySubject, forkJoin } from 'rxjs';
import { first, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  CONTENT_DATA_URL = 'assets/content.json';

  BUSINESS_DATA_URL = 'assets/businesses.json';
  LOCATIONS_DATA_URL = 'assets/locations.json';
  
  STACKS_DATA_URL = 'assets/all_stacks.json';
  
  DEMAND_CATEGORIES = 'assets/demand_categories.json';
  NEIGHBORHOODS_GEOJSON = 'assets/neighborhoods.geojson';

  public businesses = new ReplaySubject<any>(1);
  public locations = new ReplaySubject<any>(1);
  public neighborhods = new ReplaySubject<any>(1);
  public demand_categories = new ReplaySubject<any>(1);
  public stacks = new ReplaySubject<any>(1);
  public content = new ReplaySubject<any>(1);

  constructor(private http: HttpClient) {
    this.http.get(this.CONTENT_DATA_URL).subscribe((response) => {
      this.content.next(response);
    });
    this.http.get(this.BUSINESS_DATA_URL).subscribe((response) => {
      this.businesses.next(response);
    });
    this.http.get(this.LOCATIONS_DATA_URL).subscribe((response) => {
      this.locations.next(response);
    });
    this.http.get(this.DEMAND_CATEGORIES).subscribe((response) => {
      this.demand_categories.next(response);
    });
    this.http.get(this.STACKS_DATA_URL).subscribe((response: any[]) => {
      const stacks = {};
      for (const stack of response) {
        stacks[stack.name] = stack;
        if (stack.cardsUrl) {
          stack.cards = [];
          this.http.get(stack.cardsUrl).subscribe((response: any) => {
            stack.cards = response;
          });
        }
      }
      this.stacks.next(stacks);
    });
    forkJoin([
      this.stacks.pipe(first()),
      this.http.get(this.NEIGHBORHOODS_GEOJSON),
    ]).subscribe((ret) => {
      const stacks = ret[0];
      const neighborhoods = ret[1];
      for (const stack_name of Object.keys(stacks)) {
        const stack = stacks[stack_name];
        if (stack.name.indexOf('demand.') === 0 || stack.name === 'demographics') {
          stack.geometry = neighborhoods;
        }
      }
      this.neighborhods.next(neighborhoods);
    });
  }
}
