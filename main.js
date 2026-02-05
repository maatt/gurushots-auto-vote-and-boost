const puppeteer = require('puppeteer');
const fs = require('fs');
const config = require('./config.json');
const COOKIE_FILE = './cookies.json';

const loadCookies = (path) => {
   try {
      if (fs.existsSync(path)) {
         const data = fs.readFileSync(path, 'utf8');
         return data ? JSON.parse(data) : [];
      }
   } catch (err) {
      console.log(`Failed to load cookies from ${path}: ${err.message}`);
   }
   return [];
};

const cookies = loadCookies(COOKIE_FILE);
const cron = require('node-cron');

const scheduleExpr = '*/30 * * * *';

const logNextRun = (task) => {
   const nextDate = task.nextDates().toDate();
   console.log(`Next run scheduled for: ${nextDate.toLocaleString()}`);
};

const runOnce = async () => {
   console.clear();
   console.log("   _____                      _           _                       _         __      __   _            \n" +
       "  / ____|                    | |         | |           /\\        | |        \\ \\    / /  | |           \n" +
       " | |  __ _   _ _ __ _   _ ___| |__   ___ | |_ ___     /  \\  _   _| |_ ___    \\ \\  / /__ | |_ ___ _ __ \n" +
       " | | |_ | | | | '__| | | / __| '_ \\ / _ \\| __/ __|   / /\\ \\| | | | __/ _ \\    \\ \\/ / _ \\| __/ _ \\ '__|\n" +
       " | |__| | |_| | |  | |_| \\__ \\ | | | (_) | |_\\__ \\  / ____ \\ |_| | || (_) |    \\  / (_) | ||  __/ |   \n" +
       "  \\_____|\\__,_|_|   \\__,_|___/_| |_|\\___/ \\__|___/ /_/    \\_\\__,_|\\__\\___/      \\/ \\___/ \\__\\___|_|   \n" +
       "                                                                                                      \n" +
       "                                                                                                      ");
   try {
      console.log('Starting Gurushots Auto Voter\n');
      console.log("------------------------------------------------");
      let browser = await puppeteer.launch({headless: true});
      let page = await browser.newPage();
      await page.setViewport({width: 1200, height: 720})
      await page.setUserAgent(await browser.userAgent());

      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const withUrl = (items, url) => items.map(item => (item.url ? item : {...item, url}));

      await page.goto('https://gurushots.com/', {waitUntil: 'networkidle0', timeout: 0});

      const getCoinBalance = async () => {
         const balanceText = await page.evaluate(() => {
            const coinImg = document.querySelector('#global-bankroll-coin');
            if (!coinImg) {
               return null;
            }
            const container = coinImg.closest('.global-bankroll-item');
            if (!container) {
               return null;
            }
            const valueEl = container.querySelector('.gs-theme-text-headline-sub-bold');
            return valueEl ? valueEl.textContent.trim() : null;
         });
         return balanceText;
      };


      if (!Object.keys(cookies).length) {
         console.log("logging in as " + config.username);
         console.log("------------------------------------------------");
         const loginSelectors = [
            '.modal-login__form input[name="email"]',
            '.modal-login__form input[placeholder*="email"]',
            '.modal-login__form input[type="email"]',
            '.modal-login__form input[type="text"]',
         ];
         const passwordSelectors = [
            '.modal-login__form input[name="password"]',
            '.modal-login__form input[type="password"]',
         ];
         const submitSelectors = [
            '.modal-login__form button[type="submit"]',
            '.modal-login__submit',
         ];

         const waitForAnySelector = async (selectors, timeoutMs = 15000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
               for (const selector of selectors) {
                  const handle = await page.$(selector);
                  if (handle) {
                     return selector;
                  }
               }
               await sleep(250);
            }
            throw new Error(`Timed out waiting for selectors: ${selectors.join(', ')}`);
         };

         const findFirstSelector = async (selectors) => {
            for (const selector of selectors) {
               const handle = await page.$(selector);
               if (handle) {
                  return selector;
               }
            }
            return null;
         };

         const openLoginModal = async () => {
            const candidates = [
               '.signin-button',
               '.non-logged-in-actions .signin-button',
               '.link--s--.login--s--',
               'header gs-header a[href*="login"]',
            ];
            for (const selector of candidates) {
               const handle = await page.$(selector);
               if (handle) {
                  await handle.click();
                  return true;
               }
            }
            return false;
         };

         await openLoginModal();
         await page.waitForSelector('.modal-login__form', {visible: true, timeout: 15000});
         const loginSelector = await waitForAnySelector(loginSelectors);
         const passwordSelector = await waitForAnySelector(passwordSelectors);
         const submitSelector = await findFirstSelector(submitSelectors);

         await page.type(loginSelector, config.username);
         await page.type(passwordSelector, config.password);
         if (!submitSelector) {
            throw new Error(`Login submit button not found. Tried: ${submitSelectors.join(', ')}`);
         }
         await page.click(submitSelector);

         await sleep(1500);
         await page.goto("https://gurushots.com/", {waitUntil: "networkidle2", timeout: 0});
         const isLoggedIn = await page.evaluate(() => {
            const signIn = document.querySelector('.signin-button');
            const loginLink = document.querySelector('.link--s--.login--s--');
            const signInVisible = signIn && getComputedStyle(signIn).display !== 'none';
            const loginVisible = loginLink && getComputedStyle(loginLink).display !== 'none';
            return !signInVisible && !loginVisible;
         });
         if (!isLoggedIn) {
            console.log("failed to login");
            process.exit(0);
         }
         console.log(`Logged in as: ${config.username}`);
         const coinBalance = await getCoinBalance();
         console.log(`Coin Balance: ${coinBalance ?? 'unknown'}`);
         let currentCookies = await page.cookies();
         if (!currentCookies.length) {
            console.log("failed to capture login cookies");
            process.exit(0);
         }
         fs.writeFileSync('./cookies.json', JSON.stringify(currentCookies));
      } else {
         console.log(config.username + " is already logged in, redirecting...");
         console.log("------------------------------------------------");
         await page.setCookie(...withUrl(cookies, 'https://gurushots.com/'));
         await page.goto("https://gurushots.com/", {waitUntil: "networkidle2", timeout: 0});
         console.log(`Logged in as: ${config.username}`);
         const coinBalance = await getCoinBalance();
         console.log(`Coin Balance: ${coinBalance ?? 'unknown'}`);
      }

      page.on('console', async e => {
         let args = [];
         try {
            args = await Promise.all(e.args().map(a => a.jsonValue()));
         } catch (err) {
            args = [];
         }
         const message = args.length ? args.join(' ') : e.text();
         if (message.includes('Generated OneLink')) {
            return;
         }
         if (args.length) {
            console.log(...args);
         } else {
            console.log(message);
         }
      });

      try {
         await page.exposeFunction('nodeLog', (...args) => {
            console.log(...args);
         });
      } catch (err) {
         // Ignore duplicate expose errors when rerunning in the same session.
      }

      const submitSuggestedChallenges = async () => {
         console.log("Joining suggested challenges...");
         await page.goto("https://gurushots.com/challenges/my-challenges/current", {waitUntil: "networkidle2", timeout: 0});
         const joinResult = await page.evaluate(async () => {
            const GREEN = '\x1b[32m';
            const RED = '\x1b[31m';
            const RESET = '\x1b[0m';
            const nodeLog = (...args) => {
               if (window.nodeLog) {
                  window.nodeLog(...args);
               } else {
                  console.log(...args);
               }
            };

            const isStoreOpen = () =>
               Boolean(document.querySelector('mat-dialog-container app-store, mat-dialog-container .store__wrapper'));

            const getChallengeTitle = (btn) => {
               const root = btn.closest('challenges-item-suggested-mobile');
               const titleEl = root ? root.querySelector('.challengesItemSuggestedMobile__text b') : null;
               return titleEl ? titleEl.textContent.trim().replace(/(^"|"$)/g, '') : 'Unknown';
            };

            const selectors = [
               'challenges-item-suggested-mobile .challengesItemSuggestedMobile__actions .gs-btn-blue--type-2--s--',
               '.challengesItemSuggestedMobile__actions .gs-btn-blue--type-2--s--',
               'challenges-item-suggested .challengesItemSuggested__actions .gs-btn-blue--type-2--s--',
               '.challengesItemSuggested__actions .gs-btn-blue--type-2--s--',
            ];

            const buttons = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
            const uniqueButtons = Array.from(new Set(buttons));
            if (!uniqueButtons.length) {
               nodeLog("No suggested challenges to submit");
               return;
            }

            nodeLog(`Submitting ${uniqueButtons.length} suggested challenge(s)`);
            for (const btn of uniqueButtons) {
               const title = getChallengeTitle(btn);
               try {
                  btn.click();
                  const start = Date.now();
                  const maxWaitMs = 12000;
                  while (Date.now() - start < maxWaitMs) {
                     if (isStoreOpen()) {
                        nodeLog("Store opened during challenge join. Stopping joins.");
                        return 'store';
                     }
                     const preSubmit = document.querySelector('.c-modal-pre-submit__actions__btn');
                     if (preSubmit) {
                        preSubmit.click();
                        break;
                     }
                     const coinConfirm = document.querySelector('mat-dialog-container .ok');
                     if (coinConfirm) {
                        coinConfirm.click();
                        break;
                     }
                     const voteJoin = document.querySelector('.modal-challenge-join__actions-vote--s--');
                     if (voteJoin) {
                        voteJoin.click();
                        break;
                     }
                     await new Promise(resolve => setTimeout(resolve, 250));
                  }
                  if (isStoreOpen()) {
                     nodeLog("Store opened during challenge join. Stopping joins.");
                     return 'store';
                  }
                  nodeLog(`Joining challenge: coin cost: 0 - ${GREEN}Joined${RESET} (${title})`);
               } catch (err) {
                  nodeLog(`Joining challenge: coin cost: 0 - ${RED}Failed${RESET} (${title})`);
               }
               await new Promise(resolve => setTimeout(resolve, 2500));
            }
         });
         if (joinResult === 'store') {
            console.log("Store opened; skipping remaining joins and proceeding to voting.");
            return;
         }
         console.log("Suggested challenge joins complete.");
      };

      await submitSuggestedChallenges();

      await page.goto("https://gurushots.com/challenges/my-challenges/current", {waitUntil: "networkidle2", timeout: 0});
      await page.evaluate(async () => {
         if (window.__gsVoteSessionStarted) {
            return;
         }
         window.__gsVoteSessionStarted = true;

         const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
         const waitForSelector = async (selector, timeoutMs = 15000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
               const el = document.querySelector(selector);
               if (el) {
                  return el;
               }
               await sleep(250);
            }
            return null;
         };
         const nodeLog = (...args) => {
            if (window.nodeLog) {
               window.nodeLog(...args);
            } else {
               console.log(...args);
            }
         };
         nodeLog("\nBeginning the Vote Session:\n");
         const LetsGo = document.getElementsByClassName('modal-vote__greeting');
         const voteBtns = Array.from(document.getElementsByClassName('icon-vote-negative'));
         const boostBtns = document.getElementsByClassName('boost-state-available');
         const actionVoteBtns = Array.from(document.querySelectorAll('.action-button .icon-voting'))
            .map(el => el.closest('.action-button'))
            .filter(Boolean);
         const voteActions = voteBtns.length ? voteBtns : actionVoteBtns;

         nodeLog("Challenges Available to Vote on:  " + voteActions.length + "\n");

         for (const btn of voteActions) {
            if (btn instanceof Element) {
               btn.click();
            } else {
               $(btn).click();
            }
            await new Promise(resolve => setTimeout(resolve, 4000));
            const titleEl = document.querySelector('.modal-vote__challenge-title span');
            const title = titleEl ? titleEl.innerText : 'Unknown';
            nodeLog("Currently Voting on: " + title);
            $(LetsGo).click();
            const picForVote = $(".modal-vote__photo__voted").prev();

            if (picForVote.length === 0) {
               $('div[ng-click="$ctrl.submit()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               $('div[ng-click="$ctrl.close()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               continue;
            } else {
               await picForVote.each(function (i, el) {
                  const r = Math.random();
                  if (i >= 10 && r > 0.2) {
                     $(el).click();
                  }
               });
               await new Promise(resolve => setTimeout(resolve, 4000));
               $('div[ng-click="$ctrl.submit()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               $('div[ng-click="$ctrl.close()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
            }
         }

         nodeLog("\n------------------------------------------------\nVoting Done\n------------------------------------------------\n");
         nodeLog("Trying for free boosts");

         if (boostBtns.length >= 1) {
            for (var btn of boostBtns) {
               $(btn).click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               const picForVote = document.querySelector('div.c-modal-boost__photos > div:nth-child(1)');
               $(picForVote).click();
               await new Promise(resolve => setTimeout(resolve, 4000));
            }
         } else {
            nodeLog("No free boosts available");
         }


      })
      await browser.close();
      await console.log('\n------------------------------------------------\nFinished Session\n------------------------------------------------\n\n\n');
   } catch (err) {
      console.log(`Runner failed: ${err.message}`);
   }
};

const runner = cron.schedule(scheduleExpr, async () => {
   await runOnce();
   logNextRun(runner);
}, {scheduled: false});

runner.start();
runOnce().then(() => logNextRun(runner));
