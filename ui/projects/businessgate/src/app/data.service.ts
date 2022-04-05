import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ReplaySubject, forkJoin } from 'rxjs';
import { first, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  CONTENT_DATA_URL = 'assets/content.json';

  BUSINESSES_DATA_URL = 'assets/businesses.json';
  BUSINESS_LICENSING_DATA_URL = 'https://opendata.hasadna.org.il/dataset/d854bea1-69af-4763-a2b7-8b193bba2ca3/resource/3830d521-c9b3-46fe-9ba4-2d90483f79a2/download/business_kind_licensing_rules.json';
  BUSINESS_PROPERTY_TAX_DATA_URL = 'https://opendata.hasadna.org.il/dataset/d854bea1-69af-4763-a2b7-8b193bba2ca3/resource/371dad70-c782-4568-a3c1-8013d460521d/download/business_kind_property_tax_rules.json';
  LOCATIONS_DATA_URL = 'assets/locations.json';
  
  STACKS_DATA_URL = 'assets/all_stacks.json';
  
  DEMAND_CATEGORIES = 'assets/demand_categories.json';
  NEIGHBORHOODS_GEOJSON = 'assets/neighborhoods.geojson';

  public businesses = new ReplaySubject<any>(1);
  public businesses_licensing = new ReplaySubject<any>(1);
  public businesses_property_tax = new ReplaySubject<any>(1);
  public locations = new ReplaySubject<any>(1);
  public neighborhods = new ReplaySubject<any>(1);
  public demand_categories = new ReplaySubject<any>(1);
  public stacks = new ReplaySubject<any>(1);
  public content = new ReplaySubject<any>(1);

  constructor(private http: HttpClient) {
    this.http.get(this.CONTENT_DATA_URL).subscribe((response) => {
      this.content.next(response);
    });
    this.http.get(this.BUSINESSES_DATA_URL).subscribe((response) => {
      this.businesses.next(response);
      this.businesses.complete();
    });
    this.http.get(this.BUSINESS_LICENSING_DATA_URL).subscribe((response) => {
      this.businesses_licensing.next(response);
      this.businesses_licensing.complete();
    });
    this.http.get(this.BUSINESS_PROPERTY_TAX_DATA_URL).subscribe((response) => {
      this.businesses_property_tax.next(response);
      this.businesses_property_tax.complete();
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
