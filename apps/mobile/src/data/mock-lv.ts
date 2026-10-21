import type { AppNotification, Comment, Family, FamilyEvent, Member, Wish } from '@/domain/types';

import type { Locale } from './locale';
import { mockComments, mockEvents, mockFamily, mockMembers, mockNotifications, mockWishes } from './mock';

/**
 * THE SAMPLE FAMILY IN LATVIAN - what the Bergs wrote, in the language the
 * app is read in. A Latvian app with an English family in it was the first
 * thing anybody watching the demo would notice (the owner, 2026-10-01, before
 * showing it). The same family, the same days and the same photographs: only
 * the words change, laid over data/mock.ts by id, and back again when the
 * language changes (store.ts). Whatever somebody adds to the demo is theirs,
 * and stays as they wrote it.
 */

interface EventWords {
  title: string;
  description?: string;
  tags?: string[];
}

const LV = {
  familyName: 'Bergu ģimene',
  members: {
    mem_martin: 'Mārtiņš',
    mem_emily: 'Emīlija',
    mem_robert: 'Roberts',
  } as Record<string, string>,
  events: {
    evt_school: {
      title: 'Emīlijas pirmā skolas diena',
      tags: ['Skola', 'Pirmā diena'],
      description: 'Viņa gribēja ieiet viena, bet pie durvīm tomēr atskatījās. Skolotāja teica, ka klase ir maza — 18 bērni.',
    },
    evt_word: {
      title: 'Roberts pateica "traktors"',
      tags: ['Pirmie vārdi'],
      description: 'Pilnīgi skaidri. Trīs reizes pēc kārtas — un tad vairs nekad.',
    },
    evt_private: {
      title: 'Tikšanās ar skolas psihologu',
      description: 'Nākamā tikšanās pēc mēneša. Nekas nopietns, bet vērts pieskatīt.',
    },
    evt_beach: {
      title: 'Nedēļas nogale pie jūras ar visu baru un diviem suņiem',
      tags: ['Brīvdienas'],
      description: 'Ūdens bija ledains. Roberts tik un tā iegāja.',
    },
    evt_gift: {
      title: 'Dāvanas ideja Mārtiņam',
      description: 'Tas velosipēdu turētājs, par kuru viņš martā runāja visu laiku.',
    },
    evt_dentist: { title: 'Zobārsts — Emīlija' },
    evt_training: {
      title: 'Peldēšanas treniņš',
      description: 'Paņemt peldbrilles. Pakaļ brauks Mārtiņš.',
    },
    evt_birthday: {
      title: 'Roberta 3. dzimšanas diena',
      tags: ['Dzimšanas diena'],
      description: 'Torte ar ekskavatoru. Ne ar traktoru — viņš mūs pats izlaboja.',
    },
    evt_concert: {
      title: 'Emīlijas skolas koncerts',
      tags: ['Skola'],
      description: 'Lielajā zālē, ieeja no pagalma puses.',
    },
    evt_car: { title: 'Auto tehniskā apskate' },
    evt_steps: {
      title: 'Roberta pirmie soļi',
      tags: ['Pirmie soļi'],
      description: 'No dīvāna līdz galdam. Četri soļi — un tad taisni zemē.',
    },
    evt_anniversary: {
      title: 'Ābele dārzā',
      description: 'Iestādījām ābeli. Roberts palīdzēja — galvenokārt stāvot bedrē.',
    },
    evt_anniversary2: { title: 'Emīlijas pirmā peldēšanas nodarbība' },
    evt_wish_martin: {
      title: 'Daudz laimes dzimšanas dienā, Vera!',
      description: 'Sešdesmit astoņi — un joprojām ātrākā pankūku cepēja visā ielā. Paldies par katru svētdienu.',
    },
    evt_capsule_robert: {
      title: 'Robertam, astoņpadsmit gados',
      description: 'Ko mēs tev vēlējām, kad tev bija trīs, un kāds tu tad biji.',
    },
    evt_capsule_emily: {
      title: 'Vēstule Emīlijai, kad viņai būs desmit',
      description: 'Tev ir septiņi, un šodien tu man teici, ka mēness brauc mūsu mašīnai līdzi. Turpini pamanīt tādas lietas.',
    },
    evt_tale_bear: {
      title: 'Lācis, kurš nevarēja aizmigt',
      description: 'Vera to izstāstīja Lieldienās, un Roberts kopš tā laika to prasa katru vakaru.',
    },
    evt_tale_song: { title: 'Mārtiņa šūpuļdziesma' },
    // Vera's life story: the questions as the Latvian app asks them (lv.ts, lifestory.q.*).
    evt_ls_born: {
      title: 'Kur un kad tu piedzimi, un ko tu zini par to dienu?',
      description: 'Cēsīs, sniegputenī. Tēvs gāja četrus kilometrus pēc vecmātes un atgriezās bez cepures.',
    },
    evt_ls_home: {
      title: 'Apraksti māju, kurā tu uzaugi.',
      description: 'Koka māja ar krāsni pašā vidū, tāpēc katra istaba no vienas puses bija silta.',
    },
    evt_ls_met: {
      title: 'Kā tu satiki savu mīlestību?',
      description: 'Ballē 1978. gadā. Viņš divreiz uzkāpa man uz kājas un atvainojās dzejā.',
    },
    evt_midsummer_0: { title: 'Jāņi pie ezera', tags: ['Jāņi'] },
    evt_midsummer_1: { title: 'Jāņi pie ezera', tags: ['Jāņi'] },
    evt_midsummer_2: { title: 'Jāņi pie ezera', tags: ['Jāņi'] },
    evt_kindergarten: { title: 'Emīlijas pirmā diena bērnudārzā', tags: ['Pirmā diena'] },
  } as Record<string, EventWords>,
  comments: {
    cmt_1: 'Paskat, cik viņa jau liela! Paldies par bildēm!',
    cmt_2: 'Vidējā ir labākā bilde.',
    cmt_3: 'Šo vajadzētu izdrukāt albumam.',
    cmt_4: 'Torti atnesīšu es. Kādā krāsā?',
    cmt_5: 'Un kopš tā laika viņš neko citu nav teicis.',
  } as Record<string, string>,
  notifications: {
    ntf_1: { title: 'Rīt: Roberta 3. dzimšanas diena', body: 'Neaizmirstiet torti ar ekskavatoru.' },
    ntf_2: { title: 'Vera komentēja', body: '"Torti atnesīšu es. Kādā krāsā?"' },
    ntf_3: { title: 'Divi notikumi pārklājas', body: 'Emīlijai 16:00 ir zobārsts un 16:30 treniņš.' },
  } as Record<string, { title: string; body: string }>,
  wishes: {
    wish_album: 'Foto albums mazbērnu bildēm',
    wish_seeds: 'Lavandas sēklas balkonam',
    wish_theatre: 'Teātra biļetes — viņa divreiz pieminēja jauno izrādi',
    wish_pen: 'Laba tintes pildspalva',
    wish_spa: 'SPA nedēļas nogale, tikai mēs divi',
  } as Record<string, string>,
};

// The English, by id: what the words go back to.
const EN_EVENTS = new Map(mockEvents.map((e) => [e.id, e]));
const EN_MEMBERS = new Map(mockMembers.map((m) => [m.id, m]));
const EN_COMMENTS = new Map(mockComments.map((c) => [c.id, c]));
const EN_NOTIFICATIONS = new Map(mockNotifications.map((n) => [n.id, n]));
const EN_WISHES = new Map(Object.values(mockWishes).flat().map((w) => [w.id, w]));

export function sampleFamily(family: Family, locale: Locale): Family {
  if (family.id !== mockFamily.id) return family;
  return { ...family, name: locale === 'lv' ? LV.familyName : mockFamily.name };
}

export function sampleMembers(members: Member[], locale: Locale): Member[] {
  return members.map((member) => {
    const english = EN_MEMBERS.get(member.id);
    if (!english) return member;
    return { ...member, displayName: (locale === 'lv' && LV.members[member.id]) || english.displayName };
  });
}

export function sampleEvents(events: FamilyEvent[], locale: Locale): FamilyEvent[] {
  return events.map((event) => {
    const english = EN_EVENTS.get(event.id);
    if (!english) return event;
    const words = locale === 'lv' ? LV.events[event.id] : undefined;
    return {
      ...event,
      title: words?.title ?? english.title,
      description: words?.description ?? english.description,
      tags: words?.tags ?? english.tags,
    };
  });
}

export function sampleComments(comments: Comment[], locale: Locale): Comment[] {
  return comments.map((comment) => {
    const english = EN_COMMENTS.get(comment.id);
    if (!english) return comment;
    return { ...comment, body: (locale === 'lv' && LV.comments[comment.id]) || english.body };
  });
}

export function sampleNotifications(notifications: AppNotification[], locale: Locale): AppNotification[] {
  return notifications.map((notification) => {
    const english = EN_NOTIFICATIONS.get(notification.id);
    const words = locale === 'lv' ? LV.notifications[notification.id] : undefined;
    if (!english || english.title === undefined) return notification;
    return { ...notification, title: words?.title ?? english.title, body: words?.body ?? english.body };
  });
}

export function sampleWishes(wishes: Wish[], locale: Locale): Wish[] {
  return wishes.map((wish) => {
    const english = EN_WISHES.get(wish.id);
    if (!english) return wish;
    return { ...wish, text: (locale === 'lv' && LV.wishes[wish.id]) || english.text };
  });
}
