import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import './ModalBase.css';
import './HardwareConfigModal.css';
import MpuPinDiagram from './MpuPinDiagram';
import ComponentPinDiagram from './ComponentPinDiagram';
import {
  getCurrentUserHardwareConfig,
  saveCurrentUserHardwareConfig,
  getHardwareCatalog,
  getDefaultHardwareConfig,
  buildConnectionLabel,
  getMappingEntries,
  normalizeMappingsByMpuPin,
  toPromptHardwareConfig,
  flattenMappings,
} from '../services/hardwareConfig';
import { streamChatCompletionWithBudget } from '../utils/chatStream';
import { fetchModelMetadata, pickInitialModel } from '../services/aiModels';

const WIRING_CHECK_SYSTEM_PROMPT = `
You are a helpful robotics teaching assistant. A student has configured wiring between a microcontroller and external components for their robot.

Review their wiring configuration and identify any obvious mistakes:
- I/O pins connected to power or ground pins (or vice versa)
- Missing essential connections for a component to work (e.g., motor driver missing enable pin)
- The same MPU pin mapped to multiple component pins that would conflict
- Pins that are typically input-only being used as output (or vice versa)
- Any other common beginner wiring mistakes

Do not flag potential mistakes that simply have a chance of being an issue. 
Only bring up issues you KNOW are going to cause a failure.

Keep your response short. Use bullet points for issues found.
If the wiring looks correct, say so briefly.
Do NOT suggest code — only comment on the wiring/pin configuration.`;

const MAX_WIRING_CHECK_TOKENS = 25000;

function makeInstanceId(componentId) {
  return `${componentId}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderPartPreview(part, className) {
  if (!part) return null;

  if (part.svg_raw) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(part.svg_raw) }}
      />
    );
  }

  if (part.svg_url) {
    return <img className={className} src={part.svg_url} alt={part.name} />;
  }

  return null;
}

const HardwareConfigModal = ({ visible, onClose }) => {
  const [catalog, setCatalog] = useState({ mpus: [], components: [], templates: [] });
  const [config, setConfig] = useState(null);
  const [activeMpuPinId, setActiveMpuPinId] = useState(null);
  const [hoveredMpuPinId, setHoveredMpuPinId] = useState(null);
  const [selectedAddComponentId, setSelectedAddComponentId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wiringFeedback, setWiringFeedback] = useState('');
  const [isCheckingWiring, setIsCheckingWiring] = useState(false);
  const [wiringCheckError, setWiringCheckError] = useState('');
  const wiringCheckActiveRef = useRef(false);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const catalogData = await getHardwareCatalog(true);
        let savedConfig = null;
        try {
          savedConfig = await getCurrentUserHardwareConfig();
        } catch (userConfigError) {
          console.warn('Unable to load user hardware config, using defaults:', userConfigError);
        }

        if (!active) return;
        setCatalog(catalogData);
        const defaultConfig = getDefaultHardwareConfig(catalogData);
        const nextConfig = savedConfig || defaultConfig;
        const hasSelectedMpu = catalogData.mpus.some((mpu) => mpu.id === nextConfig.selectedMpuId);

        setConfig(hasSelectedMpu ? nextConfig : defaultConfig);
      } catch (err) {
        console.error('Failed to load hardware config:', err);
        if (active) setError('Unable to load hardware settings.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      wiringCheckActiveRef.current = false;
    };
  }, [visible]);

  const selectedMpu = useMemo(
    () => catalog.mpus.find((mpu) => mpu.id === config?.selectedMpuId) || null,
    [catalog.mpus, config?.selectedMpuId],
  );

  const instantiatedComponents = useMemo(() => {
    const instances = config?.components || [];
    return instances
      .map((instance) => {
        const base = catalog.components.find((c) => c.id === instance.componentId);
        if (!base) return null;
        return {
          ...base,
          instanceId: instance.instanceId,
          nickname: instance.nickname || base.name,
        };
      })
      .filter(Boolean);
  }, [catalog.components, config?.components]);

  if (!visible) return null;

  const updateConfig = (updater) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return typeof updater === 'function' ? updater(prev) : updater;
    });
  };

  const handleMpuChange = (newMpuId) => {
    updateConfig((prev) => ({
      ...prev,
      selectedMpuId: newMpuId,
      mappings: {},
    }));
    setActiveMpuPinId(null);
  };

  const handleAddComponent = () => {
    if (!selectedAddComponentId) return;
    const component = catalog.components.find((c) => c.id === selectedAddComponentId);
    if (!component) return;

    updateConfig((prev) => ({
      ...prev,
      components: [
        ...(prev.components || []),
        {
          instanceId: makeInstanceId(component.id),
          componentId: component.id,
          nickname: component.name,
        },
      ],
    }));
  };

  const removeComponent = (instanceId) => {
    updateConfig((prev) => {
      const newMappings = normalizeMappingsByMpuPin(prev.mappings);
      Object.entries(newMappings).forEach(([mpuPinId, mappingValue]) => {
        const filteredEntries = getMappingEntries(mappingValue).filter((entry) => entry.instanceId !== instanceId);
        if (filteredEntries.length > 0) {
          newMappings[mpuPinId] = filteredEntries;
        } else {
          delete newMappings[mpuPinId];
        }
      });

      return {
        ...prev,
        components: (prev.components || []).filter((c) => c.instanceId !== instanceId),
        mappings: newMappings,
      };
    });
  };

  const clearMapping = (mpuPinId) => {
    updateConfig((prev) => {
      const nextMappings = { ...(prev.mappings || {}) };
      delete nextMappings[mpuPinId];
      return { ...prev, mappings: nextMappings };
    });
  };

  const handlePinConnect = (component, pin) => {
    if (!activeMpuPinId) return;

    updateConfig((prev) => {
      const nextMappings = normalizeMappingsByMpuPin(prev.mappings);
      const targetInstanceId = component.instanceId;
      const targetComponentPinId = pin.id;

      Object.entries(nextMappings).forEach(([mpuPinId, mappingValue]) => {
        const filteredEntries = getMappingEntries(mappingValue).filter(
          (entry) =>
            !(entry.instanceId === targetInstanceId && entry.componentPinId === targetComponentPinId),
        );
        if (filteredEntries.length > 0) {
          nextMappings[mpuPinId] = filteredEntries;
        } else {
          delete nextMappings[mpuPinId];
        }
      });

      const activeEntries = getMappingEntries(nextMappings[activeMpuPinId]);
      nextMappings[activeMpuPinId] = [
        ...activeEntries,
        {
          instanceId: targetInstanceId,
          componentPinId: targetComponentPinId,
          label: buildConnectionLabel(component, pin),
        },
      ];

      return {
        ...prev,
        mappings: nextMappings,
      };
    });
    setActiveMpuPinId(null);
  };

  const applyTemplate = () => {
    if (!selectedTemplateId) return;
    const template = catalog.templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    const mpuExists = catalog.mpus.some((mpu) => mpu.id === template.selectedMpuId);
    const resolvedMpuId = mpuExists
      ? template.selectedMpuId
      : (config?.selectedMpuId || catalog.mpus[0]?.id);

    if (!mpuExists) {
      console.warn(
        `Template MPU "${template.selectedMpuId}" not found in catalog — keeping current MPU "${resolvedMpuId}".`,
      );
    }

    // Only include components whose componentId exists in the catalog
    const validComponents = (template.components || []).filter((c) => {
      const exists = catalog.components.some((cc) => cc.id === c.componentId);
      if (!exists) console.warn(`Template component "${c.componentId}" not found in catalog — skipping.`);
      return exists;
    });
    const validInstanceIds = new Set(validComponents.map((c) => c.instanceId));

    // Drop mappings that reference removed component instances
    const normalizedTemplateMappings = normalizeMappingsByMpuPin(template.mappings);
    const seenComponentPins = new Set();
    const validMappings = {};
    Object.entries(normalizedTemplateMappings).forEach(([mpuPinId, mappingValue]) => {
      const validEntries = getMappingEntries(mappingValue).filter((entry) => {
        if (!validInstanceIds.has(entry.instanceId)) return false;
        const dedupeKey = `${entry.instanceId}::${entry.componentPinId}`;
        if (seenComponentPins.has(dedupeKey)) return false;
        seenComponentPins.add(dedupeKey);
        return true;
      });
      if (validEntries.length > 0) {
        validMappings[mpuPinId] = validEntries;
      }
    });

    setConfig({
      selectedMpuId: resolvedMpuId,
      components: validComponents,
      mappings: validMappings,
    });
    setActiveMpuPinId(null);
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    setError('');
    try {
      await saveCurrentUserHardwareConfig(config);
      window.dispatchEvent(new Event('hardware-config-updated'));
      onClose?.();
    } catch (err) {
      console.error('Failed to save hardware config:', err);
      setError('Unable to save hardware settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckWiring = async () => {
    const mappingCount = flattenMappings(config?.mappings).length;
    if (mappingCount === 0) {
      setWiringCheckError('Add some pin mappings first before checking your wiring.');
      setWiringFeedback('');
      return;
    }

    setIsCheckingWiring(true);
    setWiringFeedback('');
    setWiringCheckError('');
    wiringCheckActiveRef.current = true;

    try {
      const promptConfig = toPromptHardwareConfig(config, catalog);
      const lines = [`Hardware configuration to review:`, `MPU: ${promptConfig.selectedMpuName}`];
      if (promptConfig.components.length > 0) {
        lines.push(`External components: ${promptConfig.components.map((c) => c.nickname || c.name).join(', ')}`);
      }
      if (promptConfig.mappingLines.length > 0) {
        lines.push('Pin mappings:');
        promptConfig.mappingLines.forEach((m) => lines.push(`  ${m}`));
      }
      const userMessage = lines.join('\n');

      const modelMeta = await fetchModelMetadata();
      const model = pickInitialModel(modelMeta);

      const messages = [
        { role: 'system', content: WIRING_CHECK_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ];

      let accumulated = '';
      for await (const event of streamChatCompletionWithBudget(messages, model, MAX_WIRING_CHECK_TOKENS)) {
        if (!wiringCheckActiveRef.current) break;
        if (event.type === 'content') {
          accumulated += event.content;
          setWiringFeedback(accumulated);
        }
      }
    } catch (err) {
      console.error('Wiring check failed:', err);
      if (wiringCheckActiveRef.current) {
        setWiringCheckError('Unable to check wiring. Please try again.');
      }
    } finally {
      wiringCheckActiveRef.current = false;
      setIsCheckingWiring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-wide hardware-config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hardware-config-header">
          <div className="hardware-config-header-text">
            <h2><b>Hardware Configuration</b></h2>
            <p>
              {catalog.mpus.length > 1
                ? 'Select an MPU and map its pins to external components.'
                : 'Map MPU pins to external components.'}
            </p>
          </div>
          <div className="hardware-config-header-actions">
            <button
              className="hardware-config-check-button"
              onClick={handleCheckWiring}
              disabled={isCheckingWiring || loading || !config}
            >
              {isCheckingWiring ? 'Checking...' : 'Check My Wiring'}
            </button>
            <button className="hardware-config-save-button" onClick={handleSave} disabled={isSaving || loading || !config}>
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {loading && <div className="hardware-config-loading">Loading hardware catalog...</div>}
        {error && <div className="hardware-config-error">{error}</div>}

        {!loading && config && (
          <>
            <div className="hardware-config-toolbar">
              {catalog.mpus.length > 1 && (
                <label>
                  MPU
                  <select value={config.selectedMpuId || ''} onChange={(e) => handleMpuChange(e.target.value)}>
                    {catalog.mpus.map((mpu) => (
                      <option key={mpu.id} value={mpu.id}>
                        {mpu.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Template
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  <option value="">Choose template...</option>
                  {catalog.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="hardware-config-inline-button" onClick={applyTemplate} disabled={!selectedTemplateId}>
                Apply Template
              </button>
            </div>

            {(isCheckingWiring || wiringFeedback || wiringCheckError) && (
              <div className="wiring-feedback-panel">
                <div className="wiring-feedback-header">
                  <strong>
                    {isCheckingWiring && <span className="wiring-spinner" />}
                    Wiring Check Results
                  </strong>
                  {!isCheckingWiring && (
                    <button
                      className="wiring-feedback-dismiss"
                      onClick={() => { setWiringFeedback(''); setWiringCheckError(''); }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
                {isCheckingWiring && !wiringFeedback && <p className="wiring-feedback-loading">Analyzing your wiring...</p>}
                {wiringCheckError && <p className="wiring-feedback-error">{wiringCheckError}</p>}
                {wiringFeedback && <div className="wiring-feedback-text">{wiringFeedback}</div>}
              </div>
            )}

            <div className="hardware-config-body">
              <section className="hardware-panel hardware-panel-left">
                <h3>{selectedMpu?.name || 'MPU'}</h3>
                <p className="hardware-helper-text">
                  {activeMpuPinId
                    ? 'Now click a component pin on the right to connect it.'
                    : 'Click a pin label to select it for mapping.'}
                </p>

                {(selectedMpu?.svg_raw || selectedMpu?.svg_url) ? (
                  <MpuPinDiagram
                    svgRaw={selectedMpu.svg_raw}
                    svgUrl={selectedMpu.svg_url}
                    pins={selectedMpu.pins || []}
                    mappings={config.mappings}
                    activePinId={activeMpuPinId}
                    hoveredPinId={hoveredMpuPinId}
                    onPinClick={(pinId) =>
                      setActiveMpuPinId((prev) => (prev === pinId ? null : pinId))
                    }
                    onPinHover={setHoveredMpuPinId}
                    onClearMapping={clearMapping}
                  />
                ) : (
                  <>
                    {renderPartPreview(selectedMpu, 'part-preview')}
                    <div className="mpu-pin-list">
                      {(selectedMpu?.pins || []).map((pin) => {
                        const mappingEntries = getMappingEntries(config.mappings?.[pin.id]);
                        const mappingCount = mappingEntries.length;
                        const firstMapping = mappingEntries[0];
                        const titleLabel = mappingEntries.length
                          ? mappingEntries.map((entry) => entry.label || entry.componentPinId).join(', ')
                          : 'No mapping yet';
                        const buttonLabel =
                          mappingCount === 0
                            ? 'Click to map...'
                            : mappingCount === 1
                              ? (firstMapping.label || firstMapping.componentPinId)
                              : `${mappingCount} mappings`;
                        return (
                          <div className="mpu-pin-row" key={pin.id}>
                            <span className="mpu-pin-name">{pin.name}</span>
                            <button
                              className={`mpu-pin-input ${activeMpuPinId === pin.id ? 'active' : ''}`}
                              onClick={() => setActiveMpuPinId((prev) => (prev === pin.id ? null : pin.id))}
                              onMouseEnter={() => setHoveredMpuPinId(pin.id)}
                              onMouseLeave={() => setHoveredMpuPinId(null)}
                              title={titleLabel}
                            >
                              {buttonLabel}
                            </button>
                            {mappingCount > 0 && (
                              <button className="mpu-clear-button" onClick={() => clearMapping(pin.id)}>
                                Clear
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              <section className="hardware-panel hardware-panel-right">
                <h3>External Components</h3>
                <div className="component-toolbar">
                  <select value={selectedAddComponentId} onChange={(e) => setSelectedAddComponentId(e.target.value)}>
                    <option value="">Add component...</option>
                    {catalog.components.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.name}
                      </option>
                    ))}
                  </select>
                  <button className="hardware-config-inline-button" onClick={handleAddComponent} disabled={!selectedAddComponentId}>
                    Add
                  </button>
                </div>

                <div className="component-list">
                  {instantiatedComponents.map((component) => {
                    const hasVisualDiagram =
                      (component.svg_raw || component.svg_url) &&
                      component.pins.some((p) => p.svgId);

                    return (
                      <article key={component.instanceId} className="component-card">
                        <div className="component-card-header">
                          <strong>{component.nickname}</strong>
                          <button className="component-remove" onClick={() => removeComponent(component.instanceId)}>
                            Remove
                          </button>
                        </div>

                        {hasVisualDiagram ? (
                          <ComponentPinDiagram
                            svgRaw={component.svg_raw}
                            svgUrl={component.svg_url}
                            pins={component.pins}
                            instanceId={component.instanceId}
                            mappings={config.mappings}
                            activeMpuPinId={activeMpuPinId}
                            hoveredMpuPinId={hoveredMpuPinId}
                            mpuPins={selectedMpu?.pins || []}
                            onPinClick={(pinId) => {
                              const pin = component.pins.find((p) => p.id === pinId);
                              if (pin) handlePinConnect(component, pin);
                            }}
                          />
                        ) : (
                          <>
                            {renderPartPreview(component, 'part-preview')}
                            <div className="component-pin-list">
                              {component.pins.map((pin) => {
                                const shouldBlink = Object.entries(config.mappings || {}).some(
                                  ([mpuPinId, mappingValue]) =>
                                    mpuPinId === hoveredMpuPinId &&
                                    getMappingEntries(mappingValue).some(
                                      (mapping) =>
                                        mapping.instanceId === component.instanceId &&
                                        mapping.componentPinId === pin.id,
                                    ),
                                );
                                return (
                                  <button
                                    key={pin.id}
                                    className={`component-pin-button ${shouldBlink ? 'blink' : ''}`}
                                    onClick={() => handlePinConnect(component, pin)}
                                    title={pin.description || pin.name}
                                  >
                                    {pin.name}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HardwareConfigModal;
