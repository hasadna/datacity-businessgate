import { Location } from '@angular/common';
import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { from, ReplaySubject, Subject } from 'rxjs';
import * as stringify from 'json-stable-stringify';
import { switchMap } from 'rxjs/operators';
import { SCRIPT_VERSION } from './version';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  public record = new ReplaySubject<any>();
  private itemId = '';
  private state = '';
  public updateQueue = new Subject<any>();

  constructor(private firestore: AngularFirestore, private location: Location, private config: ConfigService) {
    this.updateQueue.pipe(
      switchMap((item) => {
        return this.doUpdate(item);
      })
    ).subscribe(() => {
      console.log('SAVED');
    });
  }

  handleItem(itemId) {
    let script_version = SCRIPT_VERSION;
    if (!itemId) {
      const record = {'timestamp': new Date().toISOString(), 'data': '{}'};
      from(this.firestore.collection('records').add(record))
        .subscribe((docRef) => {
          console.log('Document was written with id', docRef.id);
          this.location.replaceState('/r/' + docRef.id);
          this.itemId = docRef.id;
          this.record.next({
            self_link: window.location.href,
            script_version
          });
        });
    } else {
      this.itemId = itemId;
      from(this.firestore.collection('records').doc(itemId).get())
      .subscribe((doc) => {
        if (doc.exists) {
          this.state = (doc.data() as any).data;
          console.log('Document was retrieved with content', this.state.length);
          const record = JSON.parse(this.state);
          record.self_link = window.location.href;
          script_version = record.script_version;
          this.record.next(record);
        }
      });
      this.config.getScript(script_version);
    }
  }

  update(item) {
    this.updateQueue.next(item);
  }

  doUpdate(item) {
    const update = stringify(item);
    if (update !== this.state) {
      this.state = update;
      return this.firestore.collection('records')
                 .doc(this.itemId).set({data: update}, {merge: true}).then(() => item);
    } else {
      return Promise.resolve(item);
    }
  }

  async sendClientEmail(address, record) {
    const item = {
      to: address,
      template: {
        name: 'client-response',
        data: {
          self_link: record.self_link
        }
      }
    };
    return this.firestore.collection('mail').add(item).then((docref) => docref.id);
  }

  async sendCRMEmail(record) {
    const questions = [];
    if (record._feedback && record._feedback.length) {
      questions.push({
        name: 'הערות כלליות',
        questions: [record._feedback]
      })
    }
    if (record.questions) {
      for (const name of Object.keys(record.questions).sort()) {
        questions.push({name, questions: record.questions[name]})
      }
    }
    const item = {
      to: 'emrib@br7.org.il',
      template: {
        name: 'crm',
        data: {
          business_kind: (record._business_record ? record._business_record.business_kind_name : null) || '-',
          location: (record.location ? record.location.שם : null) || '-',
          email_address: record.email_address,
          questions: questions
        }
      }
    };
    return this.firestore.collection('mail').add(item).then((docref) => docref.id);
  }
}
