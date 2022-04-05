import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';

import { environment } from '../environments/environment';

import { AppComponent } from './app.component';
import { HatoolLibModule } from 'hatool';

import { MainPageComponent } from './main-page/main-page.component';
import { Routes, RouterModule } from '@angular/router';
import { LtrDirective } from './ltr.directive';
import { ChatMsgImageComponent } from './chat-msgs/chat-msg-image/chat-msg-image.component';
import { ChatMsgSelectFromListComponent } from './chat-msgs/chat-msg-select-from-list/chat-msg-select-from-list.component';
import { ChatMsgCardStackComponent } from './chat-msgs/chat-msg-card-stack/chat-msg-card-stack.component';
import { SimpleCardComponent } from './cards/simple-card/simple-card.component';
import { TitleCardComponent } from './cards/title-card/title-card.component';
import { BaseCardComponent } from './cards/base-card/base-card.component';
import { GalleryCardComponent } from './cards/gallery-card/gallery-card.component';
import { ChatlikeEndingCardComponent } from './cards/chatlike-ending-card/chatlike-ending-card.component';
import { WidgetMapComponent } from './widgets/widget-map/widget-map.component';
import { StackHeaderCardComponent } from './cards/stack-header-card/stack-header-card.component';
import { ScoresCardComponent } from './cards/scores-card/scores-card.component';
import { WidgetStackComponent } from './widgets/widget-stack/widget-stack.component';
import { WidgetMoreInfoChatComponent } from './widgets/widget-more-info-chat/widget-more-info-chat.component';
import { WidgetSidepageBaseComponent } from './widgets/widget-sidepage-base/widget-sidepage-base.component';
import { WidgetSidepageMainComponent } from './widgets/widget-sidepage-main/widget-sidepage-main.component';
import { WidgetOpenButtonComponent } from './widgets/widget-open-button/widget-open-button.component';
import { WidgetSidepageAboutComponent } from './widgets/widget-sidepage-about/widget-sidepage-about.component';
import { WidgetSidepageContactComponent } from './widgets/widget-sidepage-contact/widget-sidepage-contact.component';
import { WidgetSidepagePrivacyComponent } from './widgets/widget-sidepage-privacy/widget-sidepage-privacy.component';
import { WidgetSidepageEulaComponent } from './widgets/widget-sidepage-eula/widget-sidepage-eula.component';
import { WidgetStacksButtonComponent } from './widgets/widget-stacks-button/widget-stacks-button.component';
import { WidgetStacksOverviewComponent } from './widgets/widget-stacks-overview/widget-stacks-overview.component';
import { CardStackComponent } from './card-stack/card-stack.component';
import { WidgetStacksDetailComponent } from './widgets/widget-stacks-detail/widget-stacks-detail.component';
import { ChatMsgShareDialogComponent } from './chat-msgs/chat-msg-share-dialog/chat-msg-share-dialog.component';
import { ChatMsgCopyLinkComponent } from './chat-msgs/chat-msg-copy-link/chat-msg-copy-link.component';
import { ChatMsgHtmlSayComponent } from './chat-msgs/html-say/chat-msg-html-say.component';
import { OwnerProfilePhotoComponent } from './owner-profile-photo/owner-profile-photo.component';
import { CopyLinkComponent } from './copy-link/copy-link.component';
import { ChatMsgTopicSelectionComponent } from './chat-msgs/chat-msg-topic-selection/chat-msg-topic-selection.component';
import { WidgetStackBackdropComponent } from './widgets/widget-stack-backdrop/widget-stack-backdrop.component';

const appRoutes: Routes = [
  { path: 'r/:id', component: MainPageComponent },
  { path: '', component: MainPageComponent },
];

@NgModule({
  declarations: [
    AppComponent,
    MainPageComponent,
    LtrDirective,
    ChatMsgImageComponent,
    ChatMsgSelectFromListComponent,
    ChatMsgCardStackComponent,
    SimpleCardComponent,
    TitleCardComponent,
    BaseCardComponent,
    GalleryCardComponent,
    ChatlikeEndingCardComponent,
    WidgetMapComponent,
    StackHeaderCardComponent,
    ScoresCardComponent,
    WidgetStackComponent,
    WidgetMoreInfoChatComponent,
    WidgetSidepageBaseComponent,
    WidgetSidepageMainComponent,
    WidgetOpenButtonComponent,
    WidgetSidepageAboutComponent,
    WidgetSidepageContactComponent,
    WidgetSidepagePrivacyComponent,
    WidgetSidepageEulaComponent,
    WidgetStacksButtonComponent,
    WidgetStacksOverviewComponent,
    CardStackComponent,
    WidgetStacksDetailComponent,
    ChatMsgShareDialogComponent,
    ChatMsgCopyLinkComponent,
    OwnerProfilePhotoComponent,
    ChatMsgHtmlSayComponent,
    CopyLinkComponent,
    ChatMsgTopicSelectionComponent,
    WidgetStackBackdropComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    HatoolLibModule,
    RouterModule.forRoot(appRoutes, { relativeLinkResolution: 'legacy' }),
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule
  ],
  providers: [
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
