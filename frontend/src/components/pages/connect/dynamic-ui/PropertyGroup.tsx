/* eslint-disable no-useless-escape */
import { PropertyGroup } from './components';
import { PropertyComponent } from './PropertyComponent';


export const PropertyGroupComponent = (props: { group: PropertyGroup }) => {
    const g = props.group;

    return <div className='dynamicInputs'>
        {g.properties.map(p => <PropertyComponent key={p.name} property={p} />)}
    </div>
}
