import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LiveMonitor } from './components/LiveMonitor/LiveMonitor';
import ControlCenter from './pages/ControlCenter';
import ReplayLab from './pages/ReplayLab';
import StrategyLab from './pages/StrategyLab';

// Placeholders for other routes
const Placeholder = ({ title }: { title: string }) => (
    <div className="p-8 flex items-center justify-center h-full text-slate-500 text-lg">
        {title} (Coming Soon)
    </div>
);

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<AppLayout />}>
                    <Route index element={<LiveMonitor />} />
                    <Route path="controls" element={<ControlCenter />} />
                    <Route path="replay" element={<ReplayLab />} />
                    <Route path="strategy" element={<StrategyLab />} />
                    <Route path="analytics" element={<Placeholder title="Historical Analytics" />} />
                    <Route path="logs" element={<Placeholder title="Diagnostics / Logs" />} />
                    <Route path="settings" element={<Placeholder title="Settings / Credentials" />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
