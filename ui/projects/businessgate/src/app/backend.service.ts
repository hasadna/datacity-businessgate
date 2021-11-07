import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { from, ReplaySubject, Subject } from 'rxjs';
import * as stringify from 'json-stable-stringify';
import { switchMap } from 'rxjs/operators';
import { SCRIPT_VERSION } from './version';
import { ConfigService } from './config.service';
import { StacksService } from './stacks.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  public record = new ReplaySubject<any>();
  private itemId = '';
  private state = '';
  public updateQueue = new Subject<any>();

  constructor(private firestore: AngularFirestore, private router: Router, private config: ConfigService, private stacks: StacksService) {
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
    const location = window.location.href.split('#')[0];
    if (!itemId) {
      const record = {'timestamp': new Date().toISOString(), 'data': '{}'};
      from(this.firestore.collection('records').add(record))
        .subscribe((docRef) => {
          console.log('Document was written with id', docRef.id);
          this.router.navigate(['/r', docRef.id], {replaceUrl: true});
          this.itemId = docRef.id;
          const newRec = {
            self_link: 'https://br7biz.org.il/r/' + docRef.id,
            script_version
          };
          this.record.next(newRec);
          this.update(newRec);
        });
    } else {
      this.itemId = itemId;
      from(this.firestore.collection('records').doc(itemId).get())
      .subscribe((doc) => {
        if (doc.exists) {
          this.state = (doc.data() as any).data;
          console.log('Document was retrieved with content', this.state.length);
          const record = JSON.parse(this.state);
          record.self_link = location;
          record.script_version = record.script_version || script_version;
          script_version = record.script_version;
          this.record.next(record);
        }
      });
    }
    this.config.getScript(script_version);
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

  async sendDirectQuestion(record, owner, questions) {
    if (!record.email_address || questions.length === 0) {
      return;
    }
    const item = {
      to: owner.email,
      cc: [record.email_address, 'diklas@br7.org.il', 'rsv@br7.org.il'],
      bcc: 'emrib@br7.org.il',
      template: {
        name: 'direct-question',
        data: {
          job_title: owner.title,
          business_kind: (record._business_record ? record._business_record.business_kind_name : null) || '-',
          location: (record.location ? record.location.שם : null) || '-',
          questions: questions,
        }
      }
    };
    console.log('Send Direct email', item);
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
      to: record.email_address,
      cc: ['diklas@br7.org.il', 'rsv@br7.org.il'],
      bcc: 'emrib@br7.org.il',
      template: {
        name: 'crm',
        data: {
          self_link: record.self_link,
          business_kind: (record._business_record ? record._business_record.business_kind_name : null) || '-',
          location: (record.location ? record.location.שם : null) || '-',
          phone_number: record.phone_number || '',
          email_address: record.email_address,
          questions: questions,
          stack_modules: this.stacks.stack_modules,
        }
      }
    };
    console.log('Send CRM email', item);
    return this.firestore.collection('mail').add(item).then((docref) => docref.id);
  }
}
