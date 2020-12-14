import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  url: string = null;

  constructor(private http: HttpClient, private config: ConfigService) {
    this.config.config.subscribe((cfg) => {
      this.url = cfg.postUrl;
    });
  }

  saveRecord(record) {
    if (this.url) {
      return this.http.post(this.url, record);
    } else {
      return of({success: true});
    }
  }
}
