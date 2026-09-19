'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

const COMMISSION_CATEGORIES = [
  { key: 'groceries',     label: 'Groceries'      },
  { key: 'dairy',         label: 'Dairy & Eggs'   },
  { key: 'snacks',        label: 'Snacks'         },
  { key: 'beverages',     label: 'Beverages'      },
  { key: 'personal_care', label: 'Personal Care'  },
  { key: 'household',     label: 'Household'      },
];

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function NumberInput({ label, value, onChange, min = 0, max = 100, step = 0.5, suffix = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          min={min} max={max} step={step}
          style={{ width: 80, padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right' }}
        />
        {suffix && <span style={{ fontSize: 13, color: '#6b7280' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleSetting({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
          background: value ? '#0D3B6E' : '#e2e8f0', transition: 'background 0.2s', padding: 0, flexShrink: 0,
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
      </button>
    </div>
  );
}

export default function AdminPlatformConfigPage() {
  const [config,   setConfig]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  // Local editable state
  const [commissions,        setCommissions]        = useState({});
  const [deliveryFee,        setDeliveryFee]        = useState(20);
  const [deliveryFeePerKm,   setDeliveryFeePerKm]   = useState(5);
  const [freeDeliveryAbove,  setFreeDeliveryAbove]  = useState(299);
  const [minOrderAmount,     setMinOrderAmount]      = useState(99);
  const [codLimit,           setCodLimit]           = useState(2000);
  const [surgeMult,          setSurgeMult]          = useState(1.5);
  const [surgeThreshold,     setSurgeThreshold]     = useState(80);
  const [firstOrderDiscount, setFirstOrderDiscount] = useState(20);
  const [referralReward,     setReferralReward]     = useState(50);
  const [maintenanceMode,    setMaintenanceMode]    = useState(false);
  const [forceUpdateVersion, setForceUpdateVersion] = useState('');

  useEffect(() => {
    api.get('/admin/platform-config')
      .then(r => {
        const d = r?.data?.config || {};
        setConfig(d);
        // Populate form fields
        setCommissions(d.commissions || {});
        setDeliveryFee(d.delivery_fee_base || 20);
        setDeliveryFeePerKm(d.delivery_fee_per_km || 5);
        setFreeDeliveryAbove(d.free_delivery_above || 299);
        setMinOrderAmount(d.min_order_amount || 99);
        setCodLimit(d.cod_limit || 2000);
        setSurgeMult(d.surge_multiplier || 1.5);
        setSurgeThreshold(d.surge_threshold_pct || 80);
        setFirstOrderDiscount(d.first_order_discount_pct || 20);
        setReferralReward(d.referral_reward || 50);
        setMaintenanceMode(d.maintenance_mode || false);
        setForceUpdateVersion(d.force_update_version || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(''); setSaved(false); setSaving(true);
    try {
      await api.patch('/admin/platform-config', {
        commissions,
        delivery_fee_base:         deliveryFee,
        delivery_fee_per_km:       deliveryFeePerKm,
        free_delivery_above:       freeDeliveryAbove,
        min_order_amount:          minOrderAmount,
        cod_limit:                 codLimit,
        surge_multiplier:          surgeMult,
        surge_threshold_pct:       surgeThreshold,
        first_order_discount_pct:  firstOrderDiscount,
        referral_reward:           referralReward,
        maintenance_mode:          maintenanceMode,
        force_update_version:      forceUpdateVersion,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#0D3B6E', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>⚙️ Platform Config</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Commission rates, fees, limits, and platform-wide settings.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '10px 24px', background: saving ? '#e2e8f0' : '#0D3B6E', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : saved ? '✅ Saved!' : 'Save Changes'}
        </button>
      </div>

      {maintenanceMode && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontWeight: 700, color: '#dc2626', fontSize: 14 }}>
          🚨 MAINTENANCE MODE IS ACTIVE — Customer app is showing maintenance screen
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Commission Rates */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
          <SectionHeader title="Commission Rates (%)" subtitle="Platform commission charged to shops per order" />
          {COMMISSION_CATEGORIES.map(cat => (
            <NumberInput
              key={cat.key}
              label={cat.label}
              value={commissions[cat.key] ?? 15}
              onChange={v => setCommissions(prev => ({ ...prev, [cat.key]: v }))}
              min={0} max={50} step={0.5}
              suffix="%"
            />
          ))}
        </div>

        {/* Delivery Fees */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <SectionHeader title="Delivery Fees" subtitle="Charged to customers" />
          <NumberInput label="Base delivery fee (₹)"      value={deliveryFee}       onChange={setDeliveryFee}       min={0} max={100} step={1} suffix="₹" />
          <NumberInput label="Per km charge (₹)"          value={deliveryFeePerKm}  onChange={setDeliveryFeePerKm}  min={0} max={20}  step={0.5} suffix="₹/km" />
          <NumberInput label="Free delivery above (₹)"    value={freeDeliveryAbove} onChange={setFreeDeliveryAbove} min={0} max={1000} step={10} suffix="₹" />
          <NumberInput label="Minimum order amount (₹)"   value={minOrderAmount}    onChange={setMinOrderAmount}    min={0} max={500}  step={5} suffix="₹" />
          <NumberInput label="COD limit (₹)"              value={codLimit}          onChange={setCodLimit}          min={0} max={10000} step={100} suffix="₹" />
        </div>

        {/* Surge + Rewards */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <SectionHeader title="Surge & Rewards" />
          <NumberInput label="Surge multiplier"            value={surgeMult}          onChange={setSurgeMult}          min={1} max={5}   step={0.1}  suffix="×" />
          <NumberInput label="Surge trigger (rider load %)" value={surgeThreshold}    onChange={setSurgeThreshold}    min={50} max={100} step={5}   suffix="%" />
          <NumberInput label="First order discount (%)"    value={firstOrderDiscount} onChange={setFirstOrderDiscount} min={0}  max={100} step={1}   suffix="%" />
          <NumberInput label="Referral reward (₹)"         value={referralReward}     onChange={setReferralReward}     min={0}  max={500} step={5}   suffix="₹" />
        </div>

        {/* Platform Settings */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
          <SectionHeader title="Platform Settings" subtitle="App version control and maintenance mode" />
          <ToggleSetting
            label="Maintenance Mode"
            description="Shows a maintenance screen to all customer app users"
            value={maintenanceMode}
            onChange={setMaintenanceMode}
          />
          <div style={{ padding: '12px 0' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Minimum Supported App Version (force update below this)
            </label>
            <input
              type="text"
              value={forceUpdateVersion}
              onChange={e => setForceUpdateVersion(e.target.value)}
              placeholder="e.g. 2.1.0"
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'monospace', width: 180 }}
            />
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Users on older versions will see a mandatory update screen
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
