/* ==========================================================================
   CutFree — i18n (বাংলা / English)
   Classic script (no modules) so the site also works from file://
   ========================================================================== */
(function (w) {
  'use strict';

  var STRINGS = {
    bn: {
      appName: 'কাটফ্রি',
      taglineShort: 'ফ্রি ভিডিও কাটার ও এডিটর',
      navEditor: 'এডিটর',
      navFeatures: 'ফিচার',
      navHow: 'কীভাবে কাজ করে',
      navFaq: 'প্রশ্ন-উত্তর',
      badgeFree: '১০০% ফ্রি',

      heroKicker: 'ভিডিও এডিটিং, কোনো ঝামেলা ছাড়াই',
      heroTitle: 'ব্রাউজারেই ভিডিও কাটুন — ফ্রি, প্রাইভেট, ওয়াটারমার্ক ছাড়া',
      heroLead: 'ভিডিও ফাইল যোগ করুন, টাইমলাইনে টেনে শুরু-শেষ ঠিক করুন, ক্লিপ ভাগ করুন, একাধিক ভিডিও জোড়া লাগান — আর এক্সপোর্ট করে ডাউনলোড করুন। আপনার ফাইল কখনও কম্পিউটার ছেড়ে কোথাও যায় না, সব কাজ হয় আপনার ব্রাউজারেই।',
      ctaStart: 'ভিডিও যোগ করে শুরু করুন',
      ctaHow: 'কীভাবে কাজ করে?',
      badgeNoUpload: 'কোনো আপলোড নেই',
      badgeNoWatermark: 'কোনো ওয়াটারমার্ক নেই',
      badgeNoSignup: 'সাইন-আপ লাগে না',
      badgeNoLimit: 'আনলিমিটেড ব্যবহার, ফ্রি',

      dropHere: 'ভিডিও ফাইল এখানে ড্রপ করুন',
      dropHint: 'অথবা কম্পিউটার থেকে বেছে নিন — MP4, WebM, MOV, MKV, M4V সাপোর্টেড',
      addVideos: 'ভিডিও যোগ করুন',
      sampleBtn: '🎬 স্যাম্পল ক্লিপ বানান',
      msgSample: '৫ সেকেন্ডের একটা স্যাম্পল ক্লিপ বানাচ্ছি…',
      sampleName: 'স্যাম্পল ক্লিপ.webm',
      privacyNote: '🔒 ফাইল শুধু আপনার ডিভাইসে প্রসেস হয় — কিছুই সার্ভারে যায় না।',
      addMore: '+ ভিডিও যোগ',
      splitBtn: '✂️ প্লেহেডে স্প্লিট (S)',

      projectTitle: 'প্রজেক্ট',
      statClips: 'ক্লিপ',
      statLength: 'দৈর্ঘ্য',
      statSize: 'আউটপুট (আনুমানিক)',

      exportTitle: 'এক্সপোর্ট সেটিংস',
      labelRes: 'রেজোলিউশন',
      labelQuality: 'কোয়ালিটি',
      labelFormat: 'ফরম্যাট',
      optSource: 'সোর্স (যেমন আছে)',
      optHigh: 'হাই (বড় ফাইল)',
      optMedium: 'ব্যালেন্সড',
      optLow: 'ছোট ফাইল',
      optAuto: 'অটো (সবচেয়ে ভালো)',
      exportBtn: '🎬 ভিডিও এক্সপোর্ট করুন',
      cancelBtn: 'বাতিল করুন',
      exportHint: 'এক্সপোর্ট ব্রাউজারেই রিয়েল-টাইমে তৈরি হয় — ২ মিনিটের ভিডিওতে প্রায় ২ মিনিট সময় লাগে। ট্যাব খোলা রাখুন।',
      doneMsg: '✅ এক্সপোর্ট শেষ! ডাউনলোড শুরু হয়েছে।',
      downloadAgain: 'আবার ডাউনলোড করুন',
      clearAll: 'সব ক্লিপ মুছে প্রজেক্ট খালি করুন',

      timelineTitle: 'টাইমলাইন',
      timelineHint: 'হ্যান্ডেল টেনে শুরু/শেষ ঠিক করুন · ক্লিপ কার্ডে ক্লিক করে সিলেক্ট করুন',
      noClips: 'এখনো কোনো ভিডিও যোগ করা হয়নি।',

      fieldsTitle: 'কেন কাটফ্রি?',
      featuresTitle: 'কেন কাটফ্রি?',
      featuresSub: 'যা দরকার, ঠিক তাই — কোনো লুকানো খরচ, কোনো লিমিট, কোনো ওয়াটারমার্ক নেই।',
      howTitle: 'মাত্র ৩ ধাপে',
      howSub: 'সফটওয়্যার ইনস্টল করতে হবে না, অ্যাকাউন্ট বানাতে হবে না।',
      faqTitle: 'সাধারণ প্রশ্ন',
      ctaBandTitle: 'আজই ভিডিও কাটা শুরু করুন',
      ctaBandSub: 'ফ্রি, ওপেন সোর্স, আর আপনার ভিডিও সম্পূর্ণ প্রাইভেট।',
      footLicense: 'MIT লাইসেন্স, ওপেন সোর্স',
      footMade: 'ব্রাউজারে তৈরি — আপনার ফাইল আপনার কাছেই থাকে।',

      // clip controls
      cPlay: '▶ চালান',
      cPause: '⏸ থামান',
      cLeft: '←',
      cRight: '→',
      cDelete: '🗑 মুছুন',
      cMute: '🔊 সাউন্ড',
      cMuted: '🔇 নীরব',
      clipLabel: 'ক্লিপ',

      // toasts / errors
      msgAdded: '{n}টি ভিডিও যোগ হয়েছে',
      msgEdge: 'প্লেহেড ক্লিপের একেবারে শুরু বা শেষে — একটু ভেতরে আনুন।',
      msgNoClip: 'আগে অন্তত একটা ভিডিও যোগ করুন।',
      msgCancelled: 'এক্সপোর্ট বাতিল হয়েছে।',
      msgExporting: 'এক্সপোর্ট চলছে… এই ট্যাবটা খোলা রাখুন।',
      msgBadFile: 'এই ফাইলটা ব্রাউজারে খোলা গেল না — অন্য ফরম্যাট চেষ্টা করুন।',
      msgRetry: 'এই কোডেক দিয়ে রেকর্ড হলো না — ব্রাউজারের ডিফল্ট ফরম্যাটে আবার চেষ্টা করছি…',
      msgNoRec: 'দুঃখিত, আপনার ব্রাউজারে রেকর্ডিং সাপোর্ট করছে না। Chrome, Edge বা Firefox ব্যবহার করুন।',
      msgCleared: 'প্রজেক্ট খালি করা হয়েছে।',
      msgSplit: 'ক্লিপ দুই ভাগে ভাগ হয়েছে।',
      msgDeleted: 'ক্লিপ মুছে ফেলা হয়েছে।',
      exporting: 'এক্সপোর্ট হচ্ছে',
      finalizing: 'ফাইল তৈরি হচ্ছে…',
      ofTotal: 'মোট'
    },

    en: {
      appName: 'CutFree',
      taglineShort: 'Free video cutter & editor',
      navEditor: 'Editor',
      navFeatures: 'Features',
      navHow: 'How it works',
      navFaq: 'FAQ',
      badgeFree: '100% free',

      heroKicker: 'Video editing, without the hassle',
      heroTitle: 'Cut video right in your browser — free, private, watermark-free',
      heroLead: 'Add your video files, drag the handles to trim, split clips, join several videos together and export. Your files never leave your computer: every byte is processed locally in the browser.',
      ctaStart: 'Add a video to start',
      ctaHow: 'How does it work?',
      badgeNoUpload: 'No uploads',
      badgeNoWatermark: 'No watermark',
      badgeNoSignup: 'No sign-up',
      badgeNoLimit: 'Unlimited & free',

      dropHere: 'Drop your video files here',
      dropHint: 'or pick them from your computer — MP4, WebM, MOV, MKV, M4V supported',
      addVideos: 'Add videos',
      sampleBtn: '🎬 Make a sample clip',
      msgSample: 'Recording a 5-second sample clip…',
      sampleName: 'sample-clip.webm',
      privacyNote: '🔒 Files are processed on your device only — nothing is uploaded.',
      addMore: '+ Add video',
      splitBtn: '✂️ Split at playhead (S)',

      projectTitle: 'Project',
      statClips: 'Clips',
      statLength: 'Duration',
      statSize: 'Estimated output',

      exportTitle: 'Export settings',
      labelRes: 'Resolution',
      labelQuality: 'Quality',
      labelFormat: 'Format',
      optSource: 'Source (as is)',
      optHigh: 'High (bigger file)',
      optMedium: 'Balanced',
      optLow: 'Small file',
      optAuto: 'Auto (best available)',
      exportBtn: '🎬 Export video',
      cancelBtn: 'Cancel',
      exportHint: 'Export is rendered in real time inside your browser — a 2-minute video takes about 2 minutes. Keep this tab open.',
      doneMsg: '✅ Export finished! Your download has started.',
      downloadAgain: 'Download again',
      clearAll: 'Remove all clips and clear project',

      timelineTitle: 'Timeline',
      timelineHint: 'Drag the handles to trim · click a clip card to select it',
      noClips: 'No video added yet.',

      fieldsTitle: 'Why CutFree?',
      featuresTitle: 'Why CutFree?',
      featuresSub: 'Exactly what you need — no hidden cost, no limits, no watermark.',
      howTitle: 'Three simple steps',
      howSub: 'Nothing to install, no account to create.',
      faqTitle: 'Frequently asked questions',
      ctaBandTitle: 'Start cutting video today',
      ctaBandSub: 'Free, open source and completely private.',
      footLicense: 'MIT licensed, open source',
      footMade: 'Built for the browser — your files stay with you.',

      cPlay: '▶ Play',
      cPause: '⏸ Pause',
      cLeft: '←',
      cRight: '→',
      cDelete: '🗑 Delete',
      cMute: '🔊 Sound',
      cMuted: '🔇 Muted',
      clipLabel: 'Clip',

      msgAdded: 'Added {n} video(s)',
      msgEdge: 'The playhead is at the very start or end of the clip — move it inside a bit.',
      msgNoClip: 'Add at least one video first.',
      msgCancelled: 'Export cancelled.',
      msgExporting: 'Exporting… please keep this tab open.',
      msgBadFile: 'This file could not be opened in the browser — try another format.',
      msgRetry: 'That codec produced nothing — retrying with the browser default…',
      msgNoRec: 'Sorry, recording is not supported in this browser. Try Chrome, Edge or Firefox.',
      msgCleared: 'Project cleared.',
      msgSplit: 'Clip split in two.',
      msgDeleted: 'Clip deleted.',
      exporting: 'Exporting',
      finalizing: 'Building file…',
      ofTotal: 'of'
    }
  };

  var CONTENT = {
    bn: {
      features: [
        { ico: '🆓', t: 'সত্যিকারের ফ্রি — কোনো লুকানো ফি নেই', d: 'কার্ড লাগবে না, ট্রায়াল শেষ হবে না, ওয়াটারমার্ক বসবে না, এক্সপোর্ট লিমিটও নেই।' },
        { ico: '🔒', t: '১০০% প্রাইভেট', d: 'ভিডিও কোথাও আপলোড হয় না। সব প্রসেসিং আপনার ব্রাউজারেই — ইন্টারনেট ছাড়াও কাজ করে।' },
        { ico: '✂️', t: 'ট্রিম, স্প্লিট, জোড়া লাগানো', d: 'টাইমলাইনে হ্যান্ডেল টেনে কাটুন, প্লেহেডে দুই ভাগ করুন, একাধিক ভিডিও সাজিয়ে একটাই ভিডিও বানান।' },
        { ico: '⚡', t: 'ইনস্টল বা সাইন-আপ নেই', d: 'লিংক খুলুন, ফাইল টেনে ড্রপ করুন, কাজ শেষ। ফোন-ট্যাব-ডেস্কটপ সবখানেই চলে।' },
        { ico: '🎚️', t: 'নিজের সেটিংসে এক্সপোর্ট', d: '৪৮০p / ৭২০p / ১০৮০p / সোর্স রেজোলিউশন, কোয়ালিটি আর ফরম্যাট (MP4 বা WebM) বেছে নিন।' },
        { ico: '🧩', t: 'পার্মানেন্টলি ফ্রি ও ওপেন সোর্স', d: 'কোড MIT লাইসেন্সে খোলা — নিজের সার্ভারে হোস্ট করুন, বদলে নিন, নিজের মতো বানান।' }
      ],
      steps: [
        { t: 'ভিডিও যোগ করুন', d: 'ফাইল ড্রপ করুন বা “ভিডিও যোগ করুন” বাটনে ক্লিক করে একাধিক ফাইল বেছে নিন।' },
        { t: 'কাটুন ও সাজান', d: 'হ্যান্ডেল টেনে ট্রিম করুন, S চেপে স্প্লিট করুন, তীর দিয়ে ক্লিপের ক্রম বদলান।' },
        { t: 'এক্সপোর্ট করুন', d: 'রেজোলিউশন ও কোয়ালিটি বেছে এক্সপোর্ট চাপুন — নতুন ভিডিও ডাউনলোড হয়ে যাবে।' }
      ],
      faq: [
        { q: 'এটা কি সত্যিই ফ্রি? কোনো লিমিট নেই?', a: 'হ্যাঁ, সম্পূর্ণ ফ্রি — বিক্রির কিছু নেই, সাইন-আপ নেই, ওয়াটারমার্ক নেই এবং এক্সপোর্টের কোনো সংখ্যা বা দৈর্ঘ্যের সীমাও নেই। খরচটা কে দেয়? কোনো সার্ভারই লাগে না, কারণ সব কাজ আপনার ব্রাউজার করে।' },
        { q: 'আমার ভিডিও কি কারও কাছে যায়?', a: 'না। ফাইলগুলো শুধু আপনার ডিভাইসের মেমোরিতে থাকে (blob URL হিসেবে)। এক্সপোর্টও আপনার ব্রাউজারেই তৈরি হয়। আপনি চাইলে ইন্টারনেট বন্ধ করেও এডিটর ব্যবহার করতে পারেন।' },
        { q: 'এক্সপোর্টে এত সময় লাগে কেন?', a: 'ব্রাউজার নিজে থেকে ভিডিও এনকোড করে, তাই ফ্রেম-বাই-ফ্রেম রিয়েল-টাইমে লেখা হয় — ৩ মিনিটের ভিডিওতে মোটামুটি ৩ মিনিট। এজন্যই কোনো সার্ভার বা সাবস্ক্রিপশন লাগে না।' },
        { q: 'কোন ফরম্যাট/ব্রাউজার সাপোর্ট করে?', a: 'Chrome, Edge, Firefox, Safari (নতুন ভার্সন) — এগুলোতে ভালো চলবে। ইনপুট হিসেবে MP4, WebM, MOV, MKV চলে (যেটা আপনার ব্রাউজার পড়তে পারে)। আউটপুট MP4 অথবা WebM।' },
        { q: 'কোয়ালিটি কমে যাবে না তো?', a: 'ট্রিম করলে কোয়ালিটি চেঞ্জ হয় না, তবে এক্সপোর্টের সময় নতুন করে এনকোড হয় — তাই “হাই” কোয়ালিটি সেটিং বেছে নিন। সোর্স রেজোলিউশন রাখলে ভিডিও একই মাপে থাকবে।' },
        { q: 'এই সাইটটা নিজের হোস্ট করতে পারি?', a: 'অবশ্যই — পুরো সাইটটা কয়েকটা স্ট্যাটিক ফাইল (HTML, CSS, JS)। GitHub, Netlify বা Vercel-এ আপলোড করলেই চলবে, কোনো ব্যাকএন্ড লাগে না।' }
      ]
    },
    en: {
      features: [
        { ico: '🆓', t: 'Actually free, no hidden fees', d: 'No credit card, no expiring trial, no watermark, no export quota.' },
        { ico: '🔒', t: '100% private', d: 'Your video is never uploaded. Everything runs inside your browser — it even works offline.' },
        { ico: '✂️', t: 'Trim, split, join', d: 'Drag the timeline handles to cut, split at the playhead, and stitch several clips into one video.' },
        { ico: '⚡', t: 'No install, no sign-up', d: 'Open the page, drop your file, done. Works on phone, tablet and desktop.' },
        { ico: '🎚️', t: 'Export your way', d: 'Pick 480p / 720p / 1080p / source resolution, quality level and format (MP4 or WebM).' },
        { ico: '🧩', t: 'Free and open source forever', d: 'MIT licensed code — host it yourself, fork it, make it yours.' }
      ],
      steps: [
        { t: 'Add videos', d: 'Drop files on the panel or click “Add videos” to pick several at once.' },
        { t: 'Cut & arrange', d: 'Drag handles to trim, press S to split, use the arrows to reorder clips.' },
        { t: 'Export', d: 'Choose resolution and quality, hit export, and the new video downloads itself.' }
      ],
      faq: [
        { q: 'Is it really free? Any limits?', a: 'Yes — completely free. No purchase, no sign-up, no watermark and no cap on export count or length. How is that possible? There is no server involved at all; your browser does the work.' },
        { q: 'Does my video get uploaded anywhere?', a: 'No. Files stay in your device memory as blob URLs and export happens locally. You can even turn off your internet and keep editing.' },
        { q: 'Why does exporting take as long as the video?', a: 'The browser encodes the video frame by frame in real time — a 3 minute video takes about 3 minutes. That trade-off is exactly why no server or subscription is needed.' },
        { q: 'Which formats and browsers work?', a: 'Chrome, Edge, Firefox and recent Safari work best. Input can be MP4, WebM, MOV or MKV (whatever your browser can decode); output is MP4 or WebM.' },
        { q: 'Does quality drop?', a: 'Trimming alone does not change quality, but exporting re-encodes the video — so pick the "High" quality preset. Keeping source resolution preserves the original size.' },
        { q: 'Can I host this site myself?', a: 'Absolutely — the whole site is a few static files (HTML, CSS, JS). Drop it on GitHub Pages, Netlify or Vercel; no backend required.' }
      ]
    }
  };

  w.CutFreeI18N = { strings: STRINGS, content: CONTENT };

  w.cfT = function (key, vars) {
    var lang = w.CF_LANG || 'bn';
    var table = STRINGS[lang] || STRINGS.bn;
    var s = table[key] != null ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return s;
  };

  w.cfContent = function () {
    var lang = w.CF_LANG || 'bn';
    return CONTENT[lang] || CONTENT.bn;
  };
})(window);
