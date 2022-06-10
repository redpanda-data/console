
import topicConfigInfo from '../assets/topicConfigInfo.json';

function isNumericType(typeName: string) {
    switch (typeName.toLowerCase()) {
        case "short":
        case "long":
        case "int":
        case "double":
            return true;

        default:
            return false;
    }
}

export function inferTopicConfigType(topicConfigName: string): 'number' | 'string' {
    const name = topicConfigName.toLowerCase();
    const prop = topicConfigInfo.find(x => x.Name == name);
    if (!prop) return 'string';

    if (isNumericType(prop.Type)) {
        return 'number';
    }

    return 'string';
}
