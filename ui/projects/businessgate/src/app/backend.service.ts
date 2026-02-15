import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { from, ReplaySubject, Subject } from 'rxjs';
import stringify from 'quick-stable-stringify';
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

  EMAIL_TO = 'arielagc@br7.org.il';
  EMAIL_CC = ['arielagc@br7.org.il', 'rsv@br7.org.il'];
  EMAIL_BCC = 'emri@hasadna.org.il';

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
          console.log('Document was retrieved with content', this.state);
          const record = JSON.parse(this.state);
          record.self_link = location;
          record.script_version = record.script_version || script_version;
          script_version = record.script_version;
          this.record.next(record);
        } else {
          this.router.navigate([''], {replaceUrl: true});
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
    const business_name = record.סוג_עסק || '-';
    const item = {
      to: owner.email,
      cc: [record.email_address, ...this.EMAIL_CC],
      bcc: this.EMAIL_BCC,
      template: {
        name: 'direct-question',
        data: {
          job_title: owner.title,
          business_kind: business_name,
          location: (record.location ? record.location.שם : null) || '-',
          questions: questions,
        }
      }
    };
    console.log('Send Direct email', item);
    return this.firestore.collection('mail').add(item).then((docref) => docref.id);
  }

  async _sendCRMEmail(record, template, to_user) {
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
    const recipient_email_address = record.email_address || this.EMAIL_TO;
    const business_name = record.סוג_עסק || '-';
    const item = {
      to: to_user ? recipient_email_address : this.EMAIL_TO,
      cc: this.EMAIL_CC,
      bcc: this.EMAIL_BCC,
      template: {
        name: template,
        data: {
          self_link: record.self_link,
          business_kind: business_name,
          location: (record.location ? record.location.שם : null) || '-',
          phone_number: record.phone_number || '',
          email_address: record.email_address || '',
          questions: questions,
          stack_modules: this.stacks.stack_modules,
        }
      }
    };
    console.log('Send CRM email', template, item);
    return this.firestore.collection('mail').add(item).then((docref) => docref.id);
  }

  async sendCRMEmail(record) {
    return await this._sendCRMEmail(record, 'crm', true);
  }

  async sendCRMEmailInitial(record) {
    return await this._sendCRMEmail(record, 'crm-open', false);
  }
}
