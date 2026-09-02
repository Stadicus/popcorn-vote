# Popcorn Vote – The Handbook

This documentation explains everything about the app: how to use it, how the
rules of the game work, how the technology behind it operates, and how to set
it up and maintain it on your own server. It is deliberately written so that
**no technical knowledge** is needed. Where a technical term is unavoidable, it
is briefly explained.

"Your own server" here means whatever machine at home runs the app around the
clock: a small home server, a network storage box, a mini PC, or a rented machine
somewhere else. All it needs is Docker and a folder it may write to. Ready-made
containers are available for Intel and AMD processors (`linux/amd64`) as well
as ARM devices such as Raspberry Pi and ARM servers (`linux/arm64`).

**Contents**

1. [What is Popcorn Vote?](#1-what-is-popcorn-vote)
2. [The first launch on a device](#2-the-first-launch-on-a-device)
3. [The app in daily use – screen by screen](#3-the-app-in-daily-use--screen-by-screen)
4. [The rules of the game in detail](#4-the-rules-of-the-game-in-detail)
5. [Getting the app onto your phone](#5-getting-the-app-onto-your-phone)
6. [How the technology works – no jargon](#6-how-the-technology-works--no-jargon)
7. [Setting it up on your server – step by step](#7-setting-it-up-on-your-server--step-by-step)
8. [Maintenance and administration](#8-maintenance-and-administration)
9. [When something goes wrong](#9-when-something-goes-wrong)

---

## 1. What is Popcorn Vote?

Popcorn Vote is a small app for family movie nights. It solves a
familiar problem: everyone wants to watch something different, and in the end
the loudest voice always wins.

The idea behind it:

- **Everyone can suggest films**, as many as they like.
- **Each person gets one vote per week.** You place your vote on the film you
  want to watch.
- **If you do not spend your vote straight away, it is saved up.** This way,
  someone who really wants to see a particular film can collect votes over
  several weeks and put them all on the same film. In the long run, even a
  wish held by only one person can win through.
- **Before movie night, someone taps "Evaluate now".** The film with the most
  votes wins. In the event of a tie, a wheel of fortune decides – visible to
  everyone and with equal odds.
- **After the evening, the film is rated** (one to five stars, halves
  allowed) and moves to the archive. Over time, this builds a lovely family
  film diary.

Named PIN accounts control access to the app; administrators can manage them
under **More → Settings**. The person selected for voting remains a separate,
quick device choice. This lets a shared family tablet switch voters with one tap
without turning every vote into another login.

---

## 2. The first launch on a device

Two things happen the very first time the app is opened on a new device.

**Step 1: Account and PIN.** On a completely new installation, the browser asks
for the first administrator's name and four-digit PIN. Later visits ask for an
account name and its PIN. This is the bouncer at the door: strangers who stumble
across the address cannot get in. The device remembers the sign-in until the
configured inactivity timeout expires. On a phone, the digits are tapped on the
number pad; anyone with a keyboard can type them directly (⌫ removes a digit).

Anyone who enters the PIN wrong a few times has to wait between attempts –
first 2 seconds, then 4, then 8, and so on, up to a maximum of five minutes.
For the family this is barely noticeable; anyone trying to work through all
10,000 combinations will find it practically impossible.

**Step 2: Who are you?** After that, the app shows the family members and
asks who you are. The device remembers this too. The top of the app always
shows who you are currently signed in as – a tap on it is enough to switch
person. That is handy when several people vote one after another on the
family tablet.

---

## 3. The app in daily use – screen by screen

At the bottom of the app there are five sections: **List**, **New**, **🎬
Movie Night**, **Archive**, and **More**.

### The list (home screen)

The heart of the app. All suggested films appear as a grid of posters, the
most popular at the top; ties are sorted alphabetically. So that a tile does
not slip out from under your finger when you tap the plus repeatedly, the
list only re-sorts itself after a brief moment of stillness – and then glides
smoothly rather than jumping. On a phone, two tiles sit side by side; on a
larger screen, correspondingly more. On each tile:

- the **number of votes** placed on the film, top right on the poster,
- **coloured circles** in the colours of the people who have votes on it,
  stacked directly under that number,
- the **title** immediately beneath the poster,
- a **plus and a minus** at the foot of the tile, to place or withdraw
  your own vote – without a detour through a menu.

Placing a vote is celebrated on the spot: a piece of popcorn grows over the
poster, pops, and its pieces fly outward and dissolve. Withdrawing one stays
quiet. The same little burst fires on the film's details page, and devices
set to reduced motion skip it entirely.

Films that are currently **in the lead** get a golden frame around the
poster. In the event of a tie, several get one; if no film has a vote on
it, none is golden. Gold means "in the lead" throughout the app – the film
already confirmed for the evening, by contrast, carries the orange accent
colour, since nothing about it can change any more.

At the top you can see your own balance of free votes. Once it is full
(five), a hint appears so that Sunday's vote does not expire by accident. A
tap on your own name opens the person picker; it shows, next to each person,
how many free votes they currently have. Like every dialogue in the app, it
also closes with a click outside it, without changing anything.

If a film has just won, it is set apart at the top, highlighted as **"This is
what we watch next"**.

### New: suggesting a film

Type a title into the search field – the app searches a large online film
encyclopaedia and shows matching results with poster and year. Tapping a
result first opens a preview with poster, year, runtime, age rating, genre,
and a short description – so you can immediately tell whether it really is
the right film. It only goes into the list via the **"Add movie to the
list"** button. That way nothing ends up in the list by accident.
The app fetches everything else automatically: poster, a short description,
release year, runtime, genre, age rating, original language, a rating, and
the trailer. The rating is the IMDb one where OMDb supplies it, and TMDB's
own otherwise, the film page says which of the two it is showing. The age rating is shown only for information, the
app does not restrict anything on its account – and for films entered by
hand, it is left out altogether.

If the film is already on the list, or has already been watched, the app
says so honestly – for example *"You already watched this film on 12
March"*. You can add it anyway; sometimes you really do want to watch a film
again.

If the search cannot find the film (or the internet happens to be down), you
can simply add it by hand: type the title (the year may stay empty), and a
placeholder takes the place of the poster. Later, the entry can be linked to
the encyclopaedia with a click, after which the poster and data follow
automatically.

### The film details

Tapping a tile opens the details page: a large poster, description, all the
information, the trailer ready to play directly (in the film's original
language), and who has placed how many votes.

Below the description and the trailer, under the heading **"This
suggestion"**, sit two fields that describe the entry rather than the film.
The first is **"Wanted by"** as a drop-down list. It can be changed at any
time – handy when you suggest a film for someone else: first suggest it,
then pick the right person. The votes already placed stay put, since they
belong to whoever placed them. One thing to note: after this change, only
the newly assigned person may delete the suggestion.

Right below it is the **"Where to find it"** field – a drop-down list
(default: *Netflix*, *Google*, *Server*; you set the entries in the
configuration). The family maintains this themselves, together: whoever
discovers that the film is now available somewhere else simply updates it.

Right at the bottom, deliberately unobtrusive, is the **"Watch this movie
tonight"** button – the free pick, see the rules of the game.

### 🎬 Movie Night: the evaluation

This is where the current standings are shown, and where the big **"Evaluate
now"** button lives. Because everyone is allowed to do this, a safety
question comes first: *"Evaluate now? The winner will then be decided."*

The film with the most votes wins. If two or more films are tied at the
top, the **wheel of fortune** appears with exactly those films, spins, and
slowly comes to a stop – chance decides, with exactly equal odds for
everyone involved. Afterwards: the winner is announced with a large poster
and a burst of popcorn that fills the screen. A free pick is celebrated the
same way.

Above the standings sits a second, quieter button: **"Someone missing?"**.
Tap it and a row of the family appears; tap whoever is not there tonight and
the list recounts on the spot. Their films step back and say *"waits for
Ben"* instead of a number, the confirmation reads *"Reveal the winner
without Ben?"*, and the winner card afterwards carries a small *"Without
Ben"*. Tap nobody and nothing on this page changes at all.

After the evening, someone confirms **"We watched it"** here – only then
does the film move to the archive. If the evening falls through, the win can
instead be **reverted**: the film returns to the list with all its votes
and may win again straight away next time. An evening that did not happen,
after all, should not be held against the film.

### Archive

The film diary: every film watched, the most recent at the top, with date,
average rating, and the stars given by each individual person. Rating is
optional, works in half steps from 1 to 5, and can be changed at any time –
even weeks later.

Every entry has a **"Suggest again"** button: with a single tap, the film is
back on the list, without a new search. The old archive entry stays intact –
if you watch a film twice, it ends up in the diary twice, with two dates and
two ratings.

### The TV view: the big stage on the television

On a phone the way there is **More → TV view**; on a monitor it has its own
entry, **📺 TV**, in the bar. This gives the decisive moment its own stage
for when the family is sitting in front of the television: dark, large,
without menus. It shows the current standings and updates itself
automatically – showing only films that actually have votes on them;
anything else would just be clutter on the screen from sofa distance. The
leader sits framed in gold at the top, and the board fades smoothly the
further down it goes. As soon as someone evaluates on their phone, the
television takes over the show – if there is a tie, the wheel of fortune
spins there in large scale, after which the winner is celebrated with a huge
poster and a screen-filling burst of popcorn.

Getting back to the app is done via the **✕ top right** or the **Escape
key**. The symbol sits almost invisibly in the corner when idle and becomes
bold as soon as someone moves the mouse or taps – it should not be
distracting on the screen.

Two more symbols sit beside the ✕. The **⛶** starts the TV mode: the stage
fills the whole screen, turns itself to landscape (on Android; a desktop or
iPhone refuses that politely – simply turn the device), and keeps the screen
awake so a running mirror does not die mid-evening. One honest limit: the
browser only hands out that wake lock over an encrypted connection. On an
installation running over plain `http://` on the home network, the phone's
own display timeout still applies – set it generously for the evening, or
the mirror ends when the screen does. Leaving the stage in any way ends the
TV mode with it. The **↗** appears only in the installed app on an Android
phone and opens the stage in the full Chrome browser – the one with the menu
that can cast.

Here is how it gets onto the television:

- **With Chromecast, from the installed app:** open the TV view, tap **⛶**,
  then start **screen casting** from the Android quick settings (or the
  Google Home app) and pick the Chromecast. The television shows the stage
  in landscape and full screen; the phone stays on, which the TV mode takes
  care of. Incoming notifications appear on the television too – the way
  around that is **↗**: it opens the stage in full Chrome, where **"Cast…"**
  in the menu streams just this tab. If Chrome has never opened the app
  before – say the install came from another browser – it asks for the PIN
  once, like any new device.
- **With Chromecast, from the browser:** open the TV view on your phone in
  Chrome, tap **⛶**, then choose **"Cast…"** from the Chrome menu and select
  the Chromecast. The phone streams the tab; just put it down and vote from
  a second device.
- **With an iPhone:** the ⛶ helps here too; the mirroring itself runs
  through the Control Centre's **screen mirroring** onto an Apple TV. A
  Chromecast cannot be reached from an iPhone without extra apps.
- **Directly on Google TV:** in a TV browser (e.g. TV Bro), open the app's
  address, enter the PIN once, and choose **More → TV view**.

Voting and evaluating still happen on the phone – the TV view is purely a
display and cannot break anything. That is also why the standings on the
television always count *every* vote: the TV does not know who is in the
room. Who is missing is chosen on the phone, and the television only shows
it once there is a winner – *"Without Ben"* under the title.

### Data: CSV export and import

Under **More → Data**, the film list and the archive can be downloaded as a
**CSV file** – ready to open directly in Excel or LibreOffice, accented
characters included. Conversely, **Import** accepts a simple CSV: one line
per film, first column the title, second (optional) the year.
The app automatically looks up every title in the film database and takes
over the poster, description, and all the data; anything it cannot find is
added as a manual entry. Films already present are skipped. Handy for taking
over an existing wish list in one go.

### More: log and trash

The **log** is the app's memory: every evaluation with date, who triggered
it, the complete standings at that moment, and the winner. If the wheel of
fortune was involved, it records which films took part and what the outcome
was – so afterwards no one can claim the wheel was rigged. Reverted wins and
free picks are also recorded here, clearly marked. So is reassigning who
wished for a film – who changed it, on which film, and from whom to whom.

Deleted suggestions land in the **trash**. Every entry shows who deleted it
and when, and how many votes which person had placed on it. Anyone can
restore films from there (they come back without votes) or remove them
permanently.

---

## 4. The rules of the game in detail

### Getting votes

Every new person starts with an **opening balance of three votes** – so you
can join in straight away, instead of waiting for the first Sunday.

Every **Sunday at eight in the morning**, each person is automatically
credited with one vote. Nothing needs to be done for this; the app does not
even need to be open. If the server was switched off on the Sunday, the app
catches up on the credit at the next start – no week is lost, even after
several missed Sundays.

The weekday, time, and amount are configurable (see section 7). The wording
in the app always states what is actually configured.

**No one can save up more than the configured cap** – the default is five.
Anyone who already has five free votes at credit time does not get another
one; the surplus simply expires. The app warns in good time when the
balance is full. Important: votes already placed on films do not count
towards the balance – so anyone who votes regularly never runs into the cap.

If the credit is set to more than one vote, **only as much as fits below
the cap is booked**: someone at four out of five gets exactly one of three
votes, and the other two expire.

### Placing votes

The balance can be split up however you like – one vote here, three there,
even on your own suggestion. A placed vote is not final: it can be taken
back and put elsewhere at any time before the next evaluation. Nothing is
ever lost by taking a vote back, even if the balance briefly exceeds the
cap as a result – the cap only applies at the weekly credit.

Voting is **not secret**: everyone can see at any time who has placed how
many votes on which film.

### Winning, and what happens to the votes

After the evaluation (or a free pick), the following applies:

- The votes **on the winning film are spent**. They do not come back – the
  vote has been redeemed, the film is going to be watched.
- The votes **on every other film stay where they are**. Someone who put two
  votes on a film last week that did not win carries those two votes,
  plus the new Sunday vote, into the next round.
- As long as the winner has not yet been confirmed as "watched", **no new
  evaluation** can start, and no free pick either. There is never two "films
  of the evening" at once.
- The winner cannot be deleted in this state, not even by the person who
  suggested it. You can still keep voting, just on the other films.

The single exception: if the win is **reverted** (say, because the evening
fell through), the film returns to the list together with its votes.

### The free pick

Sometimes the front-runner is not quite right just then – too long for a
school night, wrong mood, guests round. For this there is a **"Watch this
movie tonight"** button on every film's details page: it makes any film from
the list the film of the evening directly, bypassing the vote.

The app warns clearly before this, because the votes placed on the chosen
film expire exactly as they would if it had won normally. After that,
exactly the same rules apply as for a normal winner. The free pick is
clearly marked in the log, including who triggered it.

### When someone is not there

Not every week has an evening when the whole family is at home. Before an
evaluation or a free pick you can therefore say who is missing, and three
rules follow from it:

1. **Only the votes of those present count.** Whoever is not there does not
   decide tonight.
2. **Films carrying a vote of someone absent are not candidates.** They stay
   on the list, greyed out, marked *"waits for Ben"* – and they cannot be
   chosen as a free pick either. The sentence for the child is: *"We do not
   watch films Mia voted for without Mia. If you do not mind a film, take
   your vote back."* Taking a vote back is free and always possible.
3. **The film remembers who was missing.** The archive and the log say
   *"Without Ben"*, but only for an evening someone actually missed.

Nothing else changes: the winner's votes are spent as always, and reverting
the win clears the absence along with it.

Two honest footnotes. First, this is **an agreement, not a lock**: whoever
holds the phone can mark anyone as absent and move anyone's votes, exactly
as everywhere else in this app. What it does do is make the fair thing the
easy thing, and the log records who evaluated and who was counted as away.
Second, whoever puts a vote on **every** film blocks every partial evening
until they take votes back – which is the same lever, used the other way
round.

### Deleting

You may only delete **your own suggestions**. Doing so, all votes that
other people had placed on the film go straight back to the people they
belong to – no one loses a vote because someone withdraws their suggestion.
Only if this would take someone over five free votes is it capped at five;
the app points this out before deleting, so you can wait if need be.

### When someone leaves the family

If a person is removed from the configuration, their free and placed votes
expire. Their film suggestions and their ratings in the archive remain and
continue to show their name.

### All the rules at a glance

| Question | Answer |
|---|---|
| How many votes per week? | One per person, Sunday at eight (configurable) |
| Maximum that can be saved? | Five – above that, the Sunday vote expires (configurable) |
| Can votes be split? | Yes, however you like, even on your own suggestion |
| Can votes be taken back? | Any time until the evaluation, without loss |
| Is voting secret? | No, everything is visible to everyone |
| Who may evaluate? | Everyone – with a safety question |
| A tie? | Wheel of fortune, equal odds, the result is logged |
| Votes on the winner? | Spent |
| Votes on the others? | Stay in place |
| The evening falls through? | Revert the win – the film comes back with its votes |
| A film bypassing the vote? | Yes, the free pick – its votes expire |
| Who may delete? | Only their own suggestion; votes go back |
| Who may rate? | Everyone, optional, 1–5 stars in half steps, changeable |
| Someone is away? | Say so before evaluating – only the votes of those present count |
| Their films? | Wait for them, and cannot be picked either – unless they take the vote back |

---

## 5. Getting the app onto your phone

The app runs in the browser but behaves like a proper app once installed.
The easiest way is via the **orange banner** at the top of the film list:

- **Android (Chrome):** tap **"Install"** in the banner – the rest is a
  single confirmation from the browser. Alternatively, via the menu (three
  dots) → **"Install app"**.
- **iPhone/iPad (Safari):** Safari cannot offer this itself, so the banner
  shows **"How it works"** with instructions: the Share icon → **"Add to
  Home Screen"** → **"Add"**.

**Anyone who does not want to install** can dismiss the banner with the
**✕**. It then stays gone permanently, even after reloading. It can be
brought back under **More → 📲 Install the app**; the entry appears exactly
when an installation is possible and the hint has been dismissed.

The banner never appears in the installed app. On the iPhone, however, there
is one quirk: Safari cannot tell whether the app is already on the home
screen alongside it. Anyone who opens the address in Safari again later
still sees the banner there – just not in the installed app.

After installing, it starts with its own icon and splash screen, without the
browser's address bar. If there is no network, it shows a friendly notice
instead of the browser's error page: the film list lives on your server, and
without a connection it is not available. The app automatically follows the
device's light/dark setting – in the evening on the sofa it is dark, without
anyone having to change anything.

---

## 6. How the technology works – no jargon

This section is for anyone who wants to know what happens behind the
scenes. You do not need to read it to use the app.

### A website that feels like an app

Popcorn Vote is a **web app**: it does not run through an app store,
but on your own server, and you reach it via an address in your browser. The
advantage: it works on any device with a browser – phone, tablet, laptop – and
nobody has to install or update anything. You *can* still install it (see
above), and then it feels like a normal app.

### Everything stays with you

The app runs entirely on your own server. There is no outside provider holding
your data, no account with any service, no advertising, no tracking. All the
data – films, votes, ratings, the log – sits in **a single file** there. That
sounds unremarkable, but it is the biggest advantage: backing up this one file
means backing up *everything*.

Film posters are downloaded once and then kept with you permanently. Even if
the internet goes down, the app keeps showing all posters and descriptions –
only the search for *new* films needs the network.

### The "container" – a box with everything inside

The app is delivered as a so-called **Docker container**. Think of it as a
ready-packed box: the app is inside it, along with everything it needs to
run. The server only has to set the box down and open it – nothing to install,
nothing to configure, no side effects on other programs. Whichever interface you
manage your containers with always shows whether the app is running healthily,
because it regularly gives a sign of life.

### Where the film data comes from

When you suggest a film, the app asks two large, free online film
encyclopaedias:

- **TMDB** (The Movie Database) supplies search, poster, description, year,
  runtime, genre, age rating, original language, and the trailer.
- **OMDb** supplies the rating from IMDb, the best-known film database in
  the world. Without an OMDb key, TMDB's own rating is shown in its place,
  labelled "TMDB" so the number always says where it came from.

Both require a free "access key" – essentially a password with which the
app identifies itself to the encyclopaedia. How to obtain one is described
in section 7. If a piece of information is missing (say, no description in
the configured language, or no trailer in the original language), the app
takes the best available alternative rather than showing an empty field.

### The PIN protection, in a little more detail

After the correct account PIN is entered, the app stores a small, tamper-proof
"pass" in the device's browser (a so-called cookie). On every visit, the
device presents this pass automatically – which is why nobody has to enter
the PIN twice. The pass is bound to that account's current PIN hash: **if you
change the PIN, every device signed in as that account is automatically signed
out**. PINs are stored as salted scrypt hashes, never as clear text.

The app remembers the waiting times after failed attempts permanently. Even
restarting the app does not reset them – a protection that cannot be
tricked.

Important: the PIN only protects reliably if the app is reachable over an
**encrypted connection** (https, the padlock symbol in the browser). The reverse
proxy in front of the app takes care of that, see section 7.

**Running it on the home network without https** is fine and needs no
settings, reached by IP address (`http://192.168.1.50:8300`) or by a local
name (`http://popcorn.local:8300`) there is no certificate to be had, and the
app is set up for that case. What it costs: on that network the PIN travels
readably, as does everything else. That is acceptable at home behind your own
router; it is not acceptable for an app reachable from the internet, which is
what the encrypted connection above is for.

Two small things if the app is reachable **both** ways at once, through the
proxy from outside and directly on the local network:

- Use the IP address or the local name for the unencrypted way in, never the
  https address. A browser refuses to replace a pass it holds for an https
  address with an unencrypted one, so the sign-in would silently fail there.
- In the settings, name the header the proxy uses (`PROTOCOL_HEADER`,
  usually `x-forwarded-proto`) rather than a fixed address (`ORIGIN`). The
  header is judged per visit, so both ways in keep working; a fixed address
  applies to every visit and shuts the local one out.

### Automatic backup

Every night at three o'clock, the app independently creates a backup copy of
its data file and keeps the **last 14 versions**. If something goes wrong –
someone deletes something by accident, a file gets corrupted – you can
simply go back to yesterday's version (or the day before, or last week's).
If the server was off overnight, the backup is caught up on the next start. The
hour and the number kept are configurable (see section 7).

### What happens if the server is ever off?

Nothing serious. The app remembers at the next start what it missed: any
missed Sunday credits are made up (each one individually, the cap still
applies), and the nightly backup is caught up. All times follow the
configured timezone – Berlin by default, daylight saving included.

---

## 7. Setting it up on your server – step by step

Needed once, takes about half an hour. Basic familiarity with your server and
with Docker helps. A walkthrough with every command spelled out is in
[docs/installation-example.md](docs/installation-example.md).

### Step 1: Create the two access keys

1. **TMDB:** create a free account at <https://www.themoviedb.org>, then
   request a key under *Settings → API* ("Developer" / non-commercial). The
   key is a long string of letters and numbers.
2. **OMDb:** on <https://www.omdbapi.com/apikey.aspx>, choose the free
   option, provide an email address, and the key arrives by email (click
   the link inside once to activate it).

Keep both keys somewhere safe, they are needed shortly.

### Step 2: Write the configuration file

In the app's data folder (the "volume", see step 3) there is a text file
`config.yaml`. The included `config.example.yaml` serves as a template. It
contains:

- **The title** shown top left in the app (`title`), for example "The
  Smith Family Movie Night". Without one, it simply says "Popcorn Vote".
  Can also be set via the environment variable `PV_TITLE`.
- **The family members**, each with a fixed identifier (`id` – never
  change it!), a display name (changeable at any time), a colour, and an
  emoji. The fixed identifier ensures that renaming someone never loses
  their votes or ratings.
- **The PIN** (`pin`), four digits.
- **The vote rules** (`token` – the block kept its old name): weekday,
  time, and amount of the credit, the cap, the opening balance. Default:
  Sunday, 8 a.m., one vote, cap of five, opening balance of three.
- **The languages** (`language`) – two different things in the same
  block:
  - `interface` is the language of the app itself: `en`, `de`, `es`, `fr`,
    `pt-BR`, `it`, `pl`, `tr`, or `ja`. **Without a value, the app speaks
    English.** Each device can additionally switch this for itself.
  - `primary`, `fallback`, `certification_country`, and `trailer` concern
    the film data: main language, fallback language, the country for the
    age rating, and the preferred order of trailer languages. Default:
    `latin`, with English as the fallback language and the age rating from
    Germany. `latin` takes each film's own title where it is written in
    Latin letters and the English one otherwise, and fetches description,
    genres and poster in English, in German for German-language films.
    The special value `original` fetches title and description in each
    film's original language whatever alphabet it uses. Neither value is
    allowed as the `fallback`, which goes to the film database unchanged;
    only `original` is allowed in `trailer`.
- **The timezone** (`timezone`) for the credit and the backup, default
  `Europe/Berlin`.
- **The nightly backup** (`backup` with `hour` and `keep`): the hour and
  the number of versions kept, default 3 a.m. and 14 versions.
- **The list of sources** for the "where to find it" field (default:
  Netflix, Google, Server).
- **A link to a daily build** (`daily_build` with `show` and `url`): if you
  run a second instance on the newest code, "More" can carry a discreet line
  pointing at it. Off by default, and with no address by default – so an
  installation never points anywhere its own operator did not name. The
  address has to start with `http://` or `https://`; anything else is
  refused with a line in the log, because it becomes a link that gets
  clicked.
- **The two keys** from step 1 – or you can leave them out here and pass
  them as environment variables at start-up instead (recommended, see
  below).

Two things can be changed while the app keeps running:

- **The language of the film data:** the title and description are stored
  in the database exactly as they were fetched when the film was added.
  A change only affects new films; existing ones keep their language, so
  the library ends up mixed. The interface language, by contrast, takes
  effect immediately, with no after-effects in the database. Every device
  can switch this for itself – the switch sits under "More" and on the PIN
  page.
- **The timezone:** in the transition week, a credit can arrive twice or
  be missed once, because the reference point shifts. At most one vote
  per person is affected, and only the once.

For test instances without a data folder, everything can also be set
entirely via environment variables: `PV_MEMBERS=Anna,Ben,Carla,David`,
`PV_START_TOKENS=3`, `PV_SOURCES=Netflix,Google,Server`. The full list is in
`.env.example` and `config.example.yaml`. Note: this derives the fixed identifier
from the name – renaming someone via `PV_MEMBERS` technically counts as a
new person. For ongoing use, `config.yaml` with fixed identifiers is the
right approach.

**Unusable values are ignored, not silently replaced.** Setting
`PV_TOKEN_HOUR=eight` does not throw a carefully maintained value from
`config.yaml` back to the default: the unusable candidate is dropped with a
warning in the log, and the other source applies instead. At start-up, the
app writes a line, `Configuration loaded`, stating where each setting came
from.

**Reading the log.** Everything the container writes is one JSON line per
event, so it can be filtered rather than read:

```sh
docker logs popcorn-vote 2>&1 | jq -R 'fromjson? | select(.level == "error")'
```

`LOG_LEVEL` sets how much appears, `debug`, `info` (the default), `warn` or
`error`. Errors are written whatever it says.

If something goes wrong while a page is being answered, the app writes one
line with the address, the method, the cause and a short reference, and shows
that same reference on screen. So when somebody in the family says "it said
`4f2a`", that is enough to find the line:

```sh
docker logs popcorn-vote 2>&1 | jq -R 'fromjson? | select(.reference // "" | startswith("4f2a"))'
```

An address that does not exist deliberately writes nothing: it is not a fault
of the app, and an old bookmark would otherwise fill the log.

### Step 3: Start the container

Build the image once (`docker build -t popcorn-vote .`) or use a
pre-built image, then start a container with:

- **Port:** 3000 (inside) mapped to a free port on the server – `8300` in the
  examples here. On a machine with a public address, bind that port to
  `127.0.0.1`, or it stands open on the internet as plain HTTP past the proxy
- **Volume:** a folder or Docker volume, mounted as `/data` – this is
  where the database, posters, backups, and `config.yaml` live. On its first
  start the container adopts a root-owned host folder, then runs the application
  as UID/GID `1000`. An explicit Docker `--user` remains untouched and must
  already match the folder ownership.
- **Environment variables:** `TMDB_API_KEY` and `OMDB_API_KEY` for the movie
	database keys. `PV_PIN` remains available only for installations migrating
	from the former shared-PIN model.
- **Restart policy:** "always" or "unless-stopped", so the app comes back
  on its own after a restart of the server

How you say all that is up to your server: a `docker run` line, the
`docker-compose.yml` in this repository, or a graphical container manager. The
app is the same in every case. Whether it is running is shown by the built-in
health check, which every one of those interfaces reads.

### Step 4: Put a reverse proxy in front (address and encryption)

To make the app reachable under a nice address and encrypted, hand it to
whatever terminates TLS on your server – Caddy, nginx, Traefik, or the proxy
built into your server's administration interface. It is sent to the port you
chose in step 3 (`8300` in this example, not the container's own `3000`), on the
machine the container runs on. With Caddy, an entry like this is enough:

```
popcornvote.your-domain.com {
    reverse_proxy localhost:8300
}
```

Caddy obtains the encryption certificate automatically; other proxies want one
assigned, from Let's Encrypt for instance. From now on, the app is reachable at
`https://popcornvote.your-domain.com` – from home and on the go, protected by
the PIN.

A proxy that runs as a container of its own cannot use `localhost` – that name
points at its own inside. It needs a shared Docker network, which the
[installation example](docs/installation-example.md) spells out.

### Step 5: Try it out

Open the address on your phone. On a new installation, create the administrator;
otherwise enter your account name and PIN. Choose a person and suggest your
first film. If the search returns results, the keys are correct. Then
"Add to Home Screen" – done.

---

## 8. Maintenance and administration

**Changing a PIN:** open **More → Settings → Users**, edit the account and use
“Change PIN”. Devices signed in as that account are automatically signed out.

**Renaming a person:** in `config.yaml`, change only the display name
(`name`) and restart the container. The balance, the votes already placed and
the ratings remain intact, because the fixed identifier (`id`) stays the same. **Never change
the identifier itself** – otherwise the app treats the person as a new
person.

**Adding a person:** write a new block into the members list and restart
the container. The person starts with the opening balance of three votes
(`token.start`) and gets their credit from the following Sunday.

**Removing a person:** delete the block from the list and restart the
container. Their votes expire, their suggestions and ratings remain
visible.

**Backing up:** the app backs itself up every night (14 versions in the
`backups` folder). It is also worth including the whole `/data` folder in
your server's regular backup – that way the configuration is covered as well.

**Restoring:** stop the container, remove `popcornvote.sqlite` together with
its `popcornvote.sqlite-wal` and `popcornvote.sqlite-shm` sidecar files (if
present), put the desired backup from `backups` in their place (renamed to
`popcornvote.sqlite`), then start the container. The write-ahead log holds
writes that belong to the old database; left behind with its index file, they
corrupt the restored one. Copy the `backups` folder aside before trying
several states in a row: every start after a restore writes a fresh backup at
once and, at the cap, pushes the oldest one out.

**Moving to a new machine:** simply take the whole `/data` folder with you and
start the container on the new device with the same volume. Nothing else
is needed – everything is in that one folder.

**Fixing `/data` permissions:** the container may start as root only long enough
to adopt a new `/data` mount, then replaces itself with the application as
`node` (UID/GID `1000`). The recursive ownership migration runs once and records
that fact in `/data/.ownership-migrated`; later starts touch only the directory
itself. Files owned by the Home Assistant Supervisor, such as `options.json`,
are deliberately excluded.

If data was copied or restored as root after that marker was created, stop the
container, remove the marker and start it again. The next start repeats the
bounded migration:

```sh
sudo rm /srv/popcorn-vote/data/.ownership-migrated
```

For a named Docker volume, remove it through a temporary container, replacing
the volume name if yours is different:

```sh
docker run --rm -v popcorn-vote-data:/data alpine rm -f /data/.ownership-migrated
```

An operator who sets Docker's `--user` bypasses this migration deliberately.
In that case, make the folder writable by that UID/GID before starting the
container.

---

## 9. When something goes wrong

**"The first-run setup cannot save the administrator."**
The container must be able to write `/data`; the setup writes
`/data/config.yaml` there. Check the startup log for an unsafe `DATA_DIR` or a
failed privilege drop. With an explicit Docker `--user`, check that the mounted
folder belongs to that UID/GID. After externally restoring files as root, use
the ownership-marker recovery above.

**"Forgotten every administrator PIN."**
This deliberately has no unauthenticated reset button. An operator with access
to the deployment can temporarily set the legacy `PV_PIN`, leave the account
name empty on the sign-in page, enter that PIN, and create or repair a named
administrator in Settings. Remove `PV_PIN` again afterwards.

**"The film search finds nothing / reports an error."**
If the key is the problem, the suggestion page says so itself: whether it is
missing, is still the placeholder from the example configuration, or was
refused by TMDB. Correct it in `config.yaml` or in the environment and restart
the container. Without such a notice, the internet or TMDB happens to be down;
the app still works normally otherwise – films can be added by hand and linked
later.

**"A film is missing its IMDb rating."**
In that case OMDb was not reachable when the film was added, or does not
know the film. Where no OMDb key is configured at all, the film shows TMDB's
own rating instead, labelled "TMDB", so a missing line means neither
database had a number for this film. If the key itself is unusable, there is
a line about it under "More". Everything else works independently of this.

**"Someone did not get their Sunday vote."**
Check whether their balance was already full (five free votes) – in that
case the new vote expires deliberately. If the server was off, the credit is
made up automatically at the next start.

**"A device is suddenly asked for the PIN again."**
This happens if the PIN was changed, the device's browser data was
cleared, or an instance without a persistent data folder was restarted. In
this case the app automatically takes you to the PIN page – enter it once
more, and all is well again.

**"It cannot be evaluated."**
Either there is not yet a single vote on any film, or an earlier winner
has not yet been confirmed as "watched", or reverted. The evaluation page
explains what is currently missing.

**"Is the app even running?"**
`docker ps` shows the container's health status, as does every graphical
container manager. Anyone who wants to know for certain: the app's `/healthz`
address replies with a brief "ok" as long as everything is fine.
