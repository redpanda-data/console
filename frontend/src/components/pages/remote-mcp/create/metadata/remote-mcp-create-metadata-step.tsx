import { Plus, Trash2 } from 'lucide-react';
import { useCheckMCPServerNameUniqueness } from '../../../../../react-query/api/remote-mcp';
import { RESOURCE_TIERS } from '../../../../../utils/resource-tiers';
import { Button } from '../../../../redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../redpanda-ui/components/card';
import { Input } from '../../../../redpanda-ui/components/input';
import { Label } from '../../../../redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../redpanda-ui/components/select';
import { Textarea } from '../../../../redpanda-ui/components/textarea';

interface MetadataStepProps {
  displayName: string;
  setDisplayName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  tags: Array<{ key: string; value: string }>;
  setTags: (tags: Array<{ key: string; value: string }>) => void;
  resources: string;
  setResources: (value: string) => void;
}

export const RemoteMCPCreateMetadataStep = ({
  displayName,
  setDisplayName,
  description,
  setDescription,
  tags,
  setTags,
  resources,
  setResources,
}: MetadataStepProps) => {
  const { checkNameUniqueness, isLoading: isCheckingUniqueness } = useCheckMCPServerNameUniqueness();

  const isNameDuplicate = displayName.trim() !== '' && !isCheckingUniqueness && !checkNameUniqueness(displayName);

  const addTag = () => {
    setTags([...tags, { key: '', value: '' }]);
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const updateTag = (index: number, field: 'key' | 'value', value: string) => {
    const updatedTags = tags.map((tag, i) => (i === index ? { ...tag, [field]: value } : tag));
    setTags(updatedTags);
  };

  const hasDuplicateKeys = () => {
    const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
    return keys.length !== new Set(keys).size;
  };

  const getDuplicateKeys = () => {
    const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    return new Set(duplicates);
  };

  return (
    <Card className="max-w-full px-8 py-6">
      <CardHeader>
        <CardTitle>Server Metadata</CardTitle>
        <CardDescription>Configure the basic information and resources for your MCP server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name *</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My MCP Server"
            required
            className={isNameDuplicate ? 'border-destructive focus:border-destructive' : ''}
          />
          {isNameDuplicate && (
            <p className="text-sm text-destructive">
              A server with this name already exists. Please choose a different name.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this MCP server does..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground pb-2">Key-value pairs for organizing and categorizing</p>
            {hasDuplicateKeys() && <p className="text-sm text-destructive">Tags must have unique keys</p>}
            {tags.map((tag, index) => {
              const duplicateKeys = getDuplicateKeys();
              const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Key"
                      value={tag.key}
                      className={isDuplicateKey ? 'border-destructive focus:border-destructive' : ''}
                      onChange={(e) => updateTag(index, 'key', e.target.value)}
                    />
                    <div className="h-5 mt-1">
                      {isDuplicateKey && <p className="text-xs text-destructive">Duplicate key</p>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Value"
                      value={tag.value}
                      onChange={(e) => updateTag(index, 'value', e.target.value)}
                    />
                    <div className="h-5 mt-1" />
                  </div>
                  <div className="flex items-center h-10">
                    <Button variant="outline" size="sm" onClick={() => removeTag(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addTag}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tag
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resources">Resources</Label>
          <Select value={resources} onValueChange={setResources}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOURCE_TIERS.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>
                  {tier.fullSpec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
