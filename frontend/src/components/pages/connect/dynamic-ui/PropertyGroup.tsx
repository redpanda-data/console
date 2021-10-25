/* eslint-disable no-useless-escape */
import { observer } from 'mobx-react';
import { PropertyGroup } from './components';
import { PropertyComponent } from './PropertyComponent';

export const PropertyGroupComponent = observer((props: { group: PropertyGroup }) => {
    const g = props.group;

    return <div className='dynamicInputs'>
        {g.properties.map(p => <PropertyComponent key={p.name} property={p} />)}
    </div>
});
