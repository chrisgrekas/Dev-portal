import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import AllPage from './pages/AllPage';
import CustomerPage from './pages/customers/CustomerPage';
import RuleDetail from './pages/rules/RuleDetail';
import RulesetDetail from './pages/rulesets/RulesetDetail';
import WorkflowDetail from './pages/workflows/WorkflowDetail';
import WikiLayout from './pages/wiki/WikiLayout';
import WikiIndex from './pages/wiki/WikiIndex';
import WikiArticlePage from './pages/wiki/WikiArticlePage';
import FieldCatalog from './pages/wiki/FieldCatalog';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

// Πελάτες (αρχική + Customer Hub) και Wiki (split view). «Όλα» για ό,τι δεν έχει πελάτη.
// Αναζήτηση παντού με ⌘K / Ctrl+K (Spotlight, στο Layout).
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="customers/:number" element={<CustomerPage />} />
        <Route path="all" element={<AllPage />} />
        <Route path="rules/:id" element={<RuleDetail />} />
        <Route path="rulesets/:id" element={<RulesetDetail />} />
        <Route path="workflows/:id" element={<WorkflowDetail />} />
        <Route path="wiki" element={<WikiLayout />}>
          <Route index element={<WikiIndex />} />
          <Route path="fields/:system" element={<FieldCatalog />} />
          <Route path=":id" element={<WikiArticlePage />} />
        </Route>
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
