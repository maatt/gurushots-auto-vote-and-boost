let puppeteer = require('puppeteer');
let fs = require('fs');
let config = require('./config.json');
//let config = require('dotenv').config();
let cookies = require('./cookies.json');
let cron = require('node-cron');

let runner = cron.schedule('*/30 * * * *', () => {
   console.clear();
   console.log("   _____                      _           _                       _         __      __   _            \n" +
       "  / ____|                    | |         | |           /\\        | |        \\ \\    / /  | |           \n" +
       " | |  __ _   _ _ __ _   _ ___| |__   ___ | |_ ___     /  \\  _   _| |_ ___    \\ \\  / /__ | |_ ___ _ __ \n" +
       " | | |_ | | | | '__| | | / __| '_ \\ / _ \\| __/ __|   / /\\ \\| | | | __/ _ \\    \\ \\/ / _ \\| __/ _ \\ '__|\n" +
       " | |__| | |_| | |  | |_| \\__ \\ | | | (_) | |_\\__ \\  / ____ \\ |_| | || (_) |    \\  / (_) | ||  __/ |   \n" +
       "  \\_____|\\__,_|_|   \\__,_|___/_| |_|\\___/ \\__|___/ /_/    \\_\\__,_|\\__\\___/      \\/ \\___/ \\__\\___|_|   \n" +
       "                                                                                                      \n" +
       "                                                                                                      ");
   (async () => {
      console.log('Starting Gurushots Auto Voter\n');
      console.log("------------------------------------------------");
      let browser = await puppeteer.launch();
      let page = await browser.newPage();
      await page.setViewport({width: 1200, height: 720})
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:87.0) Gecko/20100101 Firefox/87.0');
      await page.goto('https://gurushots.com/', {waitUntil: 'networkidle0', timeout: 0});


      if (!Object.keys(cookies).length) {
         let login = '.modal-login__form > div:nth-child(1) > input';
         let password = '.modal-login__form > div:nth-child(2) > input';
         let loginSubmit = '#dialogContent_0 > md-dialog-content > form > button'

         await page.evaluate(async () => {
            let loginBtn = document.querySelectorAll('header gs-header div > div > protection:nth-child(1) a');
            for (var btn of loginBtn) {
               let style = getComputedStyle(btn);

               if (style.display !== 'none') {
                  await btn.click();
                  break;
               }
            }

         })
         console.log("logging in as " + config.username);
         console.log("------------------------------------------------");
         await page.type(login, config.username);
         await page.type(password, config.password);
         await page.click(loginSubmit);
         await page.waitForNavigation();
         await page.goto("https://gurushots.com/", {waitUntil: "networkidle2", timeout: 0});
         try {
            await page.waitForSelector('[ng-click="$ctrl.goProfile()"]');
         } catch (err) {
            console.log("failed to login");
            process.exit(0);
         }
         let currentCookies = await page.cookies();
         fs.writeFileSync('./cookies.json', JSON.stringify(currentCookies));
      } else {
         console.log(config.username + " is already logged in, redirecting...");
         console.log("------------------------------------------------");
         await page.setCookie(...cookies);
         await page.goto("https://gurushots.com/", {waitUntil: "networkidle2", timeout: 0});
      }

      page.on('console', async e => {
         let args = await Promise.all(e.args().map(a => a.jsonValue()));
         console.log(...args);
      });

      await page.evaluate(async () => {
         console.log("\nBeginning the Vote Session:\n");
         let LetsGo = document.getElementsByClassName('modal-vote__greeting');
         let voteBtns = document.getElementsByClassName('icon-vote-negative');
         let boostBtns = document.getElementsByClassName('boost-state-available');

         console.log("Challenges Available to Vote on:  " + voteBtns.length + "\n");

         for (var btn of voteBtns) {

            $(btn).click();
            await new Promise(resolve => setTimeout(resolve, 4000));
            let title = $('.modal-vote__challenge-title span')[0].innerText;
            console.log("Currently Voting on: " + title);
            $(LetsGo).click();
            let picForVote = $(".modal-vote__photo__voted").prev();

            if (picForVote.length === 0) {
               $('div[ng-click="$ctrl.submit()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               $('div[ng-click="$ctrl.close()"]').click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               continue;

            } else {
               await picForVote.each(function (i, el) {
                  r = Math.random();
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

         console.log("\n------------------------------------------------\nVoting Done\n------------------------------------------------\n");
         console.log("Trying for free boosts");
         if (boostBtns.length >= 1) {
            for (var btn of boostBtns) {
               $(btn).click();
               await new Promise(resolve => setTimeout(resolve, 4000));
               let picForVote = document.querySelector('div.c-modal-boost__photos > div:nth-child(1)');
               $(picForVote).click();
               await new Promise(resolve => setTimeout(resolve, 4000));
            }
         } else {
            console.log("No free boosts available");
         }


      })
      await browser.close();
      await console.log('\n------------------------------------------------\nFinished Session\n------------------------------------------------\n\n\n');
   })()
});
