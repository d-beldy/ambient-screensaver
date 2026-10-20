// AMBIENT_GAMES comes from manifest.js (written by the plugin backend from Steam's own
// collections). AMBIENT_CONFIG comes from config.js (static fallback). AMBIENT_SETTINGS comes
// from settings.js (written by the plugin backend from the Decky quick-access panel).
function shuffled( list )
{
    const a = list.slice();
    for ( let i = a.length - 1; i > 0; i-- )
    {
        const j = Math.floor( Math.random() * ( i + 1 ) );
        [ a[i], a[j] ] = [ a[j], a[i] ];
    }
    return a;
}

const baseGames = ( typeof AMBIENT_GAMES !== 'undefined' ? AMBIENT_GAMES : [] );
const settings = ( typeof AMBIENT_SETTINGS !== 'undefined' ? AMBIENT_SETTINGS : {} );
const fallbackInterval = ( typeof AMBIENT_CONFIG !== 'undefined' ? AMBIENT_CONFIG.interval : 12 );
const intervalSeconds = settings.duration || fallbackInterval || 12;
const intervalMs = intervalSeconds * 1000;
const ambientMode = settings.mode !== 'letterbox';
const transitionSeconds = settings.transitionDuration || 1.5;
document.documentElement.style.setProperty( '--transition-duration', `${transitionSeconds}s` );

const logoAlignClass = `align-${ settings.logoAlign || 'left' }`;
document.getElementById( 'logo-a' ).classList.add( logoAlignClass );
document.getElementById( 'logo-b' ).classList.add( logoAlignClass );

let order = [];
let pos = 0;
let activeIsA = true;
const kenBurnsState = {};

// Reshuffles for every lap around the list (instead of shuffling once and looping the same
// order forever), and if the new lap would start with the same game the previous lap just
// ended on, swaps it out so two plays of the same game never land back-to-back.
function reshuffle()
{
    const prevLast = order[ order.length - 1 ];
    const next = shuffled( baseGames );
    if ( next.length > 1 && next[0] === prevLast )
    {
        const swapWith = 1 + Math.floor( Math.random() * ( next.length - 1 ) );
        [ next[0], next[swapWith] ] = [ next[swapWith], next[0] ];
    }
    order = next;
    pos = 0;
}

// Alternating between two identical keyframes (instead of removing/re-adding the same one)
// restarts the animation without a forced-reflow hack, which itself caused a visible stutter
// right as the crossfade started. The toggle is tracked per element — with only two hero
// elements alternating in lockstep, a single shared toggle would hand the same element the
// same keyframe name every time it comes back around, which is a no-op in Chromium and left
// it frozen at the end of its first zoom forever after.
function restartKenBurns(el)
{
    const next = kenBurnsState[el.id] === 'kenburns-1' ? 'kenburns-2' : 'kenburns-1';
    kenBurnsState[el.id] = next;
    el.style.animationName = next;
    el.style.animationDuration = `${intervalSeconds}s`;
}

function showNext()
{
    if ( baseGames.length === 0 )
        return;
    if ( pos >= order.length )
        reshuffle();

    const game = order[ pos ];
    pos++;

    const showHero = document.getElementById( activeIsA ? 'hero-a' : 'hero-b' );
    const hideHero = document.getElementById( activeIsA ? 'hero-b' : 'hero-a' );
    const showLogo = document.getElementById( activeIsA ? 'logo-a' : 'logo-b' );
    const hideLogo = document.getElementById( activeIsA ? 'logo-b' : 'logo-a' );
    activeIsA = !activeIsA;

    hideLogo.classList.remove( 'visible' );

    // The logo only starts loading once its hero has actually loaded, so a slow/failed hero
    // load can never leave a mismatched hero+logo pair on screen together. Ken Burns is also
    // started only here, not at load start — otherwise a slow decode eats into the zoom's
    // visible time, and at a short display duration the zoom can finish (or nearly finish)
    // before the image is even faded in.
    showHero.onload = () =>
    {
        showHero.classList.add( 'visible' );
        hideHero.classList.remove( 'visible' );
        restartKenBurns( showHero );
        if ( ambientMode && game.ambient )
            document.documentElement.style.setProperty( '--ambient-color', game.ambient );

        if ( game.logo )
        {
            showLogo.onload = () => showLogo.classList.add( 'visible' );
            showLogo.src = game.logo;
        }
        else
        {
            showLogo.removeAttribute( 'src' );
        }
    };
    showHero.src = game.hero;
}

showNext();
setInterval( showNext, intervalMs );
