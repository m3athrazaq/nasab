// The app shell: screens by route, the tab bar, sheets, toasts, the lock, the Android back button.
import { useEffect } from 'preact/hooks';
import { effect } from '@preact/signals';
import { state, saveError } from '../core/store.js';
import { ready, personSheet } from './app-state.js';
import { route, go, back, canGoBack, isTab, closeTopOverlay } from './router.js';
import { t } from '../core/i18n.js';
import { Icon } from './icons.jsx';
import { Toasts, DialogHost, toast, PickerSheet } from './kit.jsx';
import { onBackButton, exitApp, takeOpenedFile, onFileOpened, isNative } from '../core/native.js';
import { TreeScreen, ViewSheet } from './screens/Tree.jsx';
import { PersonSheet, AddSheet } from './screens/Sheets.jsx';
import { PersonPage } from './screens/Person.jsx';
import { PersonEditor } from './screens/Editor.jsx';
import { PeopleScreen } from './screens/People.jsx';
import { RelationScreen } from './screens/Relation.jsx';
import { StatsScreen } from './screens/Stats.jsx';
import { ExportScreen, RestoreSheet, BusyOverlay, restoreFromFile } from './screens/Export.jsx';
import { PosterScreen, BookScreen, CertificateScreen } from './screens/Prints.jsx';
import { SettingsScreen, AboutScreen } from './screens/Settings.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { LockScreen, unlocked } from './screens/Lock.jsx';

const TAB_ITEMS = [['tree', 'tree', 'tab_tree'], ['people', 'people', 'tab_people'], ['relation', 'link', 'tab_relation'], ['stats', 'chart', 'tab_stats'], ['export', 'share', 'tab_export']];
// detail screens belong to a tab (for the highlighted tab)
const PARENT = { person: 'people', edit: 'people', poster: 'export', book: 'export', certificate: 'export', settings: 'export', about: 'export' };

function Tabs({ current }) {
  return (
    <nav class="tabs" aria-label={t('nav_aria')}>
      <div class="in">
        {TAB_ITEMS.map(([name, icon, label]) => (
          <button key={name} aria-current={current === name ? 'page' : undefined} onClick={() => (current === name && route.value.name === name ? window.scrollTo({ top: 0, behavior: 'smooth' }) : go(name, isTab(route.value.name)))}>
            <Icon name={icon} /><span>{t(label)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Screen({ rt }) {
  const a = rt.args;
  switch (rt.name) {
    case 'tree': return null; // the tree stays mounted below
    case 'people': return <PeopleScreen />;
    case 'person': return <PersonPage id={a[0]} key={a[0]} />;
    case 'edit': return <PersonEditor id={a[0]} key={'e' + a[0]} />;
    case 'relation': return <RelationScreen />;
    case 'stats': return <StatsScreen />;
    case 'export': return <ExportScreen />;
    case 'poster': return <PosterScreen />;
    case 'book': return <BookScreen />;
    case 'certificate': return <CertificateScreen key={rt.query.toString()} />;
    case 'settings': return <SettingsScreen />;
    case 'about': return <AboutScreen />;
    default: return null;
  }
}

export function App() {
  useEffect(() => {
    if (!__ALLOW_FRAME__) return;
    setTimeout(() => toast(t('preview_note'), { ms: 8000 }), 900);
    const f = () => toast(t('preview_files'), { ms: 6000 });
    addEventListener('nasab-preview-file', f);
    return () => removeEventListener('nasab-preview-file', f);
  }, []);
  useEffect(() => {
    onBackButton(() => {
      if (closeTopOverlay()) return;
      if (canGoBack()) back();
      else if (route.value.name !== 'tree') go('tree', true);
      else exitApp();
    });
    if (isNative) {
      takeOpenedFile().then(f => f && restoreFromFile(f));
      onFileOpened(() => takeOpenedFile().then(f => f && restoreFromFile(f)));
    }
    // the person card belongs to the screen it was opened on
    let lastRoute = '';
    const stopRoute = effect(() => {
      const r = route.value, key = r.name + '/' + r.args.join('/');
      if (lastRoute && key !== lastRoute) personSheet.value = null;
      lastRoute = key;
    });
    const stopErr = effect(() => { if (saveError.value) toast(t('e_save'), { ms: 7000 }); });
    return () => { stopRoute(); stopErr(); };
  }, []);

  const s = state.value;
  if (!ready.value) return null;
  if (s.settings.lock && !unlocked.value) return <LockScreen />;
  if (!s.settings.onboarded) return <><Onboarding /><RestoreSheet /><BusyOverlay /><Toasts /><DialogHost /></>;
  const rt = route.value;
  const known = isTab(rt.name) || PARENT[rt.name];
  const name = known ? rt.name : 'tree';
  const tab = isTab(name) ? name : PARENT[name] || 'tree';
  const onTree = name === 'tree';
  return (
    <>
      <div style={onTree ? '' : 'display:none'} aria-hidden={onTree ? undefined : 'true'}><TreeScreen /></div>
      {!onTree && <Screen rt={{ ...rt, name }} />}
      <Tabs current={tab} />
      <PersonSheet />
      <AddSheet />
      <ViewSheet />
      <PickerSheet />
      <RestoreSheet />
      <BusyOverlay />
      <Toasts />
      <DialogHost />
    </>
  );
}
