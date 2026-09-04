(function () {
    // 1. Service Payload Editor
    const AgiServicePayloadEditor = {
        name: 'AgiServicePayloadEditor',
        props: { modelValue: Object },
        template: `
            <div class="q-pa-sm font-mono text-caption bg-slate-950 text-slate-200 rounded-borders">
                <div class="text-weight-bold text-cyan-4 q-mb-xs">SERVICE SPECIFICATION</div>
                <div class="row q-col-gutter-xs q-mb-xs">
                    <q-input dark dense outlined v-model="modelValue.verb" label="Verb" class="col-6" />
                    <q-input dark dense outlined v-model="modelValue.noun" label="Noun" class="col-6" />
                </div>
                <div class="row q-col-gutter-xs">
                    <q-select dark dense outlined v-model="modelValue.serviceType" :options="['inline', 'script', 'java']" label="Type" class="col-6" />
                    <q-select dark dense outlined v-model="modelValue.transactionMode" :options="['use-or-begin', 'force-new', 'ignore']" label="Transaction" class="col-6" />
                </div>
            </div>
        `
    };

    // 2. Entity Payload Editor
    const AgiEntityPayloadEditor = {
        name: 'AgiEntityPayloadEditor',
        props: { modelValue: Object },
        template: `
            <div class="q-pa-sm font-mono text-caption bg-slate-950 text-slate-200 rounded-borders">
                <div class="text-weight-bold text-teal-4 q-mb-xs">ENTITY DATA MODEL SPECIFICATION</div>
                <div class="row q-col-gutter-xs q-mb-xs">
                    <q-input dark dense outlined v-model="modelValue.entityName" label="Entity Name" class="col-6" />
                    <q-input dark dense outlined v-model="modelValue.package" label="Package" class="col-6" />
                </div>
                <q-checkbox dark dense v-model="modelValue.enableAuditLog" label="Enforce Audit Log (enable-audit-log)" color="secondary" />
            </div>
        `
    };

    // 3. Test Payload Editor
    const AgiTestPayloadEditor = {
        name: 'AgiTestPayloadEditor',
        props: { modelValue: Object },
        template: `
            <div class="q-pa-sm font-mono text-caption bg-slate-950 text-slate-200 rounded-borders">
                <div class="text-weight-bold text-amber-4 q-mb-xs">TEST PIPELINE & EXECUTION TARGET</div>
                <q-input dark dense outlined v-model="modelValue.executionTarget" label="Target Component / Service" class="full-width q-mb-xs" />
            </div>
        `
    };

    window.AgiComponents = window.AgiComponents || {};
    window.AgiComponents['agi-service-payload-editor'] = AgiServicePayloadEditor;
    window.AgiComponents['agi-entity-payload-editor'] = AgiEntityPayloadEditor;
    window.AgiComponents['agi-test-payload-editor'] = AgiTestPayloadEditor;

    const registerEditors = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-service-payload-editor', AgiServicePayloadEditor);
            window.moqui.webrootVueApp.component('agi-entity-payload-editor', AgiEntityPayloadEditor);
            window.moqui.webrootVueApp.component('agi-test-payload-editor', AgiTestPayloadEditor);
        } else {
            setTimeout(registerEditors, 50);
        }
    };
    registerEditors();
})();