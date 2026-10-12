/* Native bridge for the Urban Reign app. Works in a normal browser too (falls back quietly). */
(function(){
  var C=window.Capacitor, native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
  var H=window.capacitorHaptics, SH=window.capacitorShare, SB=window.capacitorStatusBar, SP=window.capacitorSplashScreen;
  var SITE_URL='https://YOUR-DOMAIN.com'; /* TODO: your movie site address */
  window.URApp={
    native:native,
    haptic:function(kind){if(!native||!H)return;try{(kind==='heavy'?H.Haptics.impact({style:'HEAVY'}):H.Haptics.impact({style:'LIGHT'})).catch(function(){});}catch(e){}},
    share:function(){var d={title:'Macbeth: Urban Reign',text:'The game is the same, but the players change.',url:SITE_URL};
      if(native&&SH)return SH.Share.share(d).catch(function(){});
      if(navigator.share)return navigator.share(d).catch(function(){});
      try{navigator.clipboard.writeText(SITE_URL);}catch(e){}}
  };
  if(native){document.documentElement.classList.add('native');
    try{SB&&SB.StatusBar.setStyle({style:'DARK'}).catch(function(){});SB&&SB.StatusBar.setBackgroundColor&&SB.StatusBar.setBackgroundColor({color:'#0b0a0f'}).catch(function(){});}catch(e){}
    try{SP&&SP.SplashScreen.hide().catch(function(){});}catch(e){}}
})();

/* ---------- Money: AdMob ads + real in-app purchases (RevenueCat over Apple StoreKit / Google Play Billing) ----------
   FILL IN the keys below before you ship (see MONETIZATION.md). With the placeholder keys, configure() fails,
   so every purchase answers "error" and NOTHING is granted. Nothing in this file fakes a payment.
   The game (game.html) owns the item list (window.UR_PRODUCTS) and decides what each product unlocks.
   This file only talks to the App Store and reports back what Apple says the player owns. */
(function(){
  var CFG={
    testing:true,                                     /* AdMob: set false once your own ad unit IDs are below */
    revenuecatKeyIOS:'appl_YOUR_REVENUECAT_IOS_KEY',
    revenuecatKeyAndroid:'goog_YOUR_REVENUECAT_ANDROID_KEY',
    ios:{rewarded:'ca-app-pub-3940256099942544/1712485313',interstitial:'ca-app-pub-3940256099942544/4411468910'},
    android:{rewarded:'ca-app-pub-3940256099942544/5224354917',interstitial:'ca-app-pub-3940256099942544/1033173712'}
  };
  var C=window.Capacitor,U=window.URApp;if(!U||!U.native||!C||!C.registerPlugin)return;
  var plat=C.getPlatform?C.getPlatform():'ios',ids=plat==='android'?CFG.android:CFG.ios;
  var AdMob=C.registerPlugin('AdMob'),Pur=C.registerPlugin('Purchases');
  var ready=false,rewardLoaded=false,interLoaded=false,prices={},products={},rcReady=false,rcStart=null;
  function noAds(){try{return localStorage.getItem('urbanreign_noads')==='1';}catch(e){return false;}}
  function loadReward(){AdMob.prepareRewardVideoAd({adId:ids.rewarded,isTesting:CFG.testing}).then(function(){rewardLoaded=true;}).catch(function(){rewardLoaded=false;});}
  function loadInter(){if(noAds())return;AdMob.prepareInterstitial({adId:ids.interstitial,isTesting:CFG.testing}).then(function(){interLoaded=true;}).catch(function(){interLoaded=false;});}
  AdMob.initialize({initializeForTesting:CFG.testing})
    .then(function(){return AdMob.requestConsentInfo().then(function(ci){if(ci&&ci.isConsentFormAvailable&&ci.status==='REQUIRED')return AdMob.showConsentForm();}).catch(function(){});})
    .then(function(){if(plat!=='ios')return;return AdMob.trackingAuthorizationStatus().then(function(s){if(s&&s.status==='notDetermined')return AdMob.requestTrackingAuthorization();}).catch(function(){});})
    .then(function(){ready=true;loadReward();loadInter();}).catch(function(){});

  /* What Apple/RevenueCat says this player owns. RevenueCat validates every receipt on its server before it shows up here. */
  function toInfo(ci){var out={nonCons:[],txns:[]};if(!ci)return out;
    (ci.nonSubscriptionTransactions||[]).forEach(function(t){out.txns.push({id:t.productIdentifier,txn:t.transactionIdentifier,date:t.purchaseDate});});
    var seen={};out.txns.forEach(function(t){seen[t.id]=1;});
    (ci.allPurchasedProductIdentifiers||[]).forEach(function(id){if(seen[id])out.nonCons.push(id);});
    out.txns.forEach(function(t){if(out.nonCons.indexOf(t.id)<0)out.nonCons.push(t.id);});   /* the game ignores consumables in this list */
    return out;}
  function productIds(){return (window.UR_PRODUCTS||[]).map(function(p){return p.id;});}
  function loadProducts(){var list=productIds();if(!list.length)return Promise.resolve();
    return Pur.getProducts({productIdentifiers:list,type:'NON_SUBSCRIPTION'}).then(function(r){(r.products||[]).forEach(function(p){products[p.identifier]=p;prices[p.identifier]=p.priceString;});}).catch(function(){});}
  function start(){if(rcStart)return rcStart;
    rcStart=Pur.configure({apiKey:plat==='android'?CFG.revenuecatKeyAndroid:CFG.revenuecatKeyIOS}).then(function(){rcReady=true;
      try{Pur.addCustomerInfoUpdateListener(function(ci){if(U.onInfo)U.onInfo(toInfo(ci));});}catch(e){}   /* Ask to Buy approvals, refunds, purchases finished after a crash */
      return loadProducts();}).catch(function(){rcStart=null;});
    return rcStart;}
  start();
  U.store=true;
  U.adsReady=function(){return ready;};
  U.noAds=noAds;
  U.price=function(id){if(!products[id]&&rcReady&&productIds().length&&!U._lp){U._lp=1;loadProducts();}return prices[id]||'';};
  U.rewardAd=function(){if(!ready)return Promise.resolve(false);
    var go=rewardLoaded?Promise.resolve():AdMob.prepareRewardVideoAd({adId:ids.rewarded,isTesting:CFG.testing});
    return go.then(function(){rewardLoaded=false;return AdMob.showRewardVideoAd();}).then(function(r){loadReward();return !!r;}).catch(function(){loadReward();return false;});};
  U.interstitial=function(){if(!ready||noAds()||!interLoaded)return;interLoaded=false;AdMob.showInterstitial().catch(function(){}).then(loadInter);};
  /* sync(): what does the player own right now? (null = could not reach the store) */
  U.sync=function(){return Promise.resolve(start()).then(function(){if(!rcReady)return null;return Pur.getCustomerInfo().then(function(r){return toInfo(r.customerInfo);});}).catch(function(){return null;});};
  /* buy(id) -> {status:'ok'|'canceled'|'pending'|'owned'|'error', info, txn}. Only 'ok' means Apple charged and confirmed. */
  U.buy=function(id){return Promise.resolve(start()).then(function(){if(!rcReady)return {status:'error'};
    var p=products[id];var get=p?Promise.resolve(p):Pur.getProducts({productIdentifiers:[id],type:'NON_SUBSCRIPTION'}).then(function(r){return (r.products||[])[0];});
    return get.then(function(prod){if(!prod)return {status:'error'};
      return Pur.purchaseStoreProduct({product:prod}).then(function(res){var t=res&&res.transaction;
        if(!t||t.productIdentifier!==id)return {status:'error',info:toInfo(res&&res.customerInfo)};
        U.haptic('heavy');return {status:'ok',info:toInfo(res.customerInfo),txn:t.transactionIdentifier};});});
  }).catch(function(e){var c=e&&(e.code!==undefined?String(e.code):'');
    if((e&&e.userCancelled)||c==='1'||c==='PURCHASE_CANCELLED_ERROR')return {status:'canceled'};
    if(c==='20'||c==='PAYMENT_PENDING_ERROR')return {status:'pending'};
    if(c==='6'||c==='PRODUCT_ALREADY_PURCHASED_ERROR')return {status:'owned'};
    return {status:'error'};});};
  U.restore=function(){return Promise.resolve(start()).then(function(){if(!rcReady)return null;return Pur.restorePurchases().then(function(r){return toInfo(r.customerInfo);});}).catch(function(){return null;});};
})();
/* keep the screen on while the game is open */
(function(){var C=window.Capacitor;if(!C||!C.isNativePlatform||!C.isNativePlatform()||!C.registerPlugin)return;
  if(!/game\.html/.test(location.pathname))return;var KA=C.registerPlugin('KeepAwake');try{KA.keepAwake().catch(function(){});}catch(e){}})();
